#!/usr/bin/env node
// ============================================================
// afterself-panic — Hosted Server
// Runs on Elena's Render instance. All users share this server.
// Stores pre-signed transactions in Supabase.
// Routes incoming Twilio SMS to the right user's pre-signed tx.
//
// ENV vars required:
//   SUPABASE_URL         — from Supabase project settings
//   SUPABASE_SERVICE_KEY — service role key (NOT anon key)
//   PORT                 — optional, defaults to 3141
//   ESCROW_ADDRESS       — Elena's Solana pubkey (for cash mode destination)
//   ADMIN_SECRET         — Bearer token for /admin/* endpoints
//   TWILIO_ACCOUNT_SID   — for outbound SMS (cash mode follow-up)
//   TWILIO_AUTH_TOKEN
//   TWILIO_FROM_NUMBER
// ============================================================

import express from "express";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { Connection } from "@solana/web3.js";
import { broadcastSignedTx } from "./nonce.js";
import { sendSms } from "./twilio-client.js";

// -----------------------------------------------------------
// Startup checks
// -----------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const PORT = Number(process.env.PORT) || 3141;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    "[afterself-panic] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------

function sha256(input: string): string {
  return createHash("sha256").update(input.trim()).digest("hex");
}

async function getUserFromToken(token: string) {
  const { data } = await supabase
    .from("panic_users")
    .select("id, phone_hash, last_attempt")
    .eq("token", token)
    .single();
  return data as { id: string; phone_hash: string; last_attempt: string | null } | null;
}

function twimlResponse(res: express.Response, msg: string): void {
  res
    .set("Content-Type", "text/xml")
    .send(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${msg}</Message></Response>`
    );
}

// -----------------------------------------------------------
// App
// -----------------------------------------------------------

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // Twilio sends form-encoded

// -----------------------------------------------------------
// GET /health
// -----------------------------------------------------------

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "afterself-panic" });
});

// -----------------------------------------------------------
// GET /api/escrow-address
// Returns Elena's escrow Solana address for cash mode presign.
// -----------------------------------------------------------

app.get("/api/escrow-address", (_req, res) => {
  const address = process.env.ESCROW_ADDRESS;
  if (!address) {
    res.status(500).json({ error: "ESCROW_ADDRESS not configured on server" });
    return;
  }
  res.json({ address });
});

// -----------------------------------------------------------
// POST /api/register
// Body: { phone_hash: string }
// Returns: { token: string }
// -----------------------------------------------------------

app.post("/api/register", async (req, res) => {
  const { phone_hash } = req.body;
  if (!phone_hash || typeof phone_hash !== "string") {
    res.status(400).json({ error: "phone_hash required" });
    return;
  }

  // If already registered, return existing token (idempotent)
  const { data: existing } = await supabase
    .from("panic_users")
    .select("token")
    .eq("phone_hash", phone_hash)
    .single();

  if (existing) {
    res.json({ token: existing.token });
    return;
  }

  const { data, error } = await supabase
    .from("panic_users")
    .insert({ phone_hash })
    .select("id, token")
    .single();

  if (error || !data) {
    res.status(500).json({ error: error?.message || "Insert failed" });
    return;
  }

  await supabase.from("panic_audit").insert({
    user_id: data.id,
    action: "registered",
    details: {},
    success: true,
  });

  res.json({ token: data.token });
});

// -----------------------------------------------------------
// POST /api/actions
// Bearer auth. Body: action object.
// -----------------------------------------------------------

app.post("/api/actions", async (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) { res.status(401).json({ error: "Unauthorized" }); return; }

  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Invalid token" }); return; }

  // Enforce max 5 actions per user
  const { count } = await supabase
    .from("panic_actions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  if ((count || 0) >= 5) {
    res.status(400).json({ error: "Maximum 5 actions allowed. Revoke one first." });
    return;
  }

  const {
    label, code_hash, signed_tx, nonce_account, destination,
    amount_lamports, asset, rpc_url,
    mode, cash_receiver_name, cash_country, cash_currency,
  } = req.body;

  if (!label || !code_hash || !signed_tx || !nonce_account || !destination || !amount_lamports || !rpc_url) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const { error } = await supabase.from("panic_actions").insert({
    user_id: user.id,
    label,
    code_hash,
    signed_tx,
    nonce_account,
    destination,
    amount_lamports,
    asset: asset || "sol",
    rpc_url,
    mode: mode || "wallet",
    cash_receiver_name: cash_receiver_name || null,
    cash_country: cash_country || null,
    cash_currency: cash_currency || null,
  });

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  await supabase.from("panic_audit").insert({
    user_id: user.id,
    action: "uploaded",
    details: { label, destination },
    success: true,
  });

  res.json({ ok: true });
});

// -----------------------------------------------------------
// DELETE /api/actions/:label
// Bearer auth.
// -----------------------------------------------------------

app.delete("/api/actions/:label", async (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) { res.status(401).json({ error: "Unauthorized" }); return; }

  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Invalid token" }); return; }

  const { error } = await supabase
    .from("panic_actions")
    .delete()
    .eq("user_id", user.id)
    .eq("label", req.params.label);

  if (error) { res.status(500).json({ error: error.message }); return; }

  res.json({ ok: true });
});

// -----------------------------------------------------------
// DELETE /api/actions  (revoke all)
// Bearer auth.
// -----------------------------------------------------------

app.delete("/api/actions", async (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) { res.status(401).json({ error: "Unauthorized" }); return; }

  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Invalid token" }); return; }

  const { error } = await supabase
    .from("panic_actions")
    .delete()
    .eq("user_id", user.id);

  if (error) { res.status(500).json({ error: error.message }); return; }

  res.json({ ok: true });
});

// -----------------------------------------------------------
// GET /api/actions
// Bearer auth. Returns action summaries (no signed_tx or code_hash).
// -----------------------------------------------------------

app.get("/api/actions", async (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) { res.status(401).json({ error: "Unauthorized" }); return; }

  const user = await getUserFromToken(token);
  if (!user) { res.status(401).json({ error: "Invalid token" }); return; }

  const { data, error } = await supabase
    .from("panic_actions")
    .select("label, destination, amount_lamports, asset, nonce_account, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) { res.status(500).json({ error: error.message }); return; }

  res.json({ ok: true, data });
});

// -----------------------------------------------------------
// POST /sms  — Twilio webhook
// -----------------------------------------------------------

app.post("/sms", async (req, res) => {
  const from = (req.body.From || "").trim();
  const body = (req.body.Body || "").trim();

  if (!from || !body) {
    twimlResponse(res, "Invalid request.");
    return;
  }

  const phone_hash = sha256(from);

  // Find user by phone hash
  const { data: user } = await supabase
    .from("panic_users")
    .select("id, last_attempt")
    .eq("phone_hash", phone_hash)
    .single();

  if (!user) {
    twimlResponse(res, "Phone not registered. Visit afterself.xyz/panic.html to set up.");
    return;
  }

  // Rate limit: 60 seconds between attempts
  if (user.last_attempt) {
    const elapsed = Date.now() - new Date(user.last_attempt).getTime();
    if (elapsed < 60_000) {
      const waitSec = Math.ceil((60_000 - elapsed) / 1000);
      await supabase.from("panic_audit").insert({
        user_id: user.id,
        action: "rate_limited",
        details: { waitSec },
        success: false,
      });
      twimlResponse(res, `Rate limited. Try again in ${waitSec}s.`);
      return;
    }
  }

  // Update last_attempt
  await supabase
    .from("panic_users")
    .update({ last_attempt: new Date().toISOString() })
    .eq("id", user.id);

  // Find matching action by code hash
  const code_hash = sha256(body);

  const { data: action } = await supabase
    .from("panic_actions")
    .select("*")
    .eq("user_id", user.id)
    .eq("code_hash", code_hash)
    .single();

  if (!action) {
    await supabase.from("panic_audit").insert({
      user_id: user.id,
      action: "verify_failed",
      details: { reason: "no_match" },
      success: false,
    });
    twimlResponse(res, "Invalid code.");
    return;
  }

  // Broadcast the pre-signed transaction
  try {
    const connection = new Connection(action.rpc_url, "confirmed");
    const txSignature = await broadcastSignedTx(connection, action.signed_tx);

    if (action.mode === "cash") {
      // Cash mode: SOL goes to Elena's escrow wallet.
      // Elena handles WU manually and sends follow-up SMS via /admin/reply-sms.
      await supabase.from("panic_audit").insert({
        user_id: user.id,
        action: "cash_executed",
        details: {
          label: action.label,
          receiver: action.cash_receiver_name,
          country: action.cash_country,
          currency: action.cash_currency,
          amount_lamports: action.amount_lamports,
          txSignature,
          user_phone: from, // Elena needs this to send the reply
        },
        success: true,
      });

      twimlResponse(
        res,
        "Transfer confirmed. Cash is being arranged. " +
        "You will receive Western Union pickup details shortly."
      );
    } else {
      // Wallet mode: SOL goes directly to user's configured address.
      await supabase.from("panic_audit").insert({
        user_id: user.id,
        action: "executed",
        details: { label: action.label, destination: action.destination, txSignature },
        success: true,
      });

      twimlResponse(res, `Done. ${action.label} executed. Tx: ${txSignature.slice(0, 16)}...`);
    }
  } catch (err: any) {
    await supabase.from("panic_audit").insert({
      user_id: user.id,
      action: "execution_failed",
      details: { label: action.label, error: err.message },
      success: false,
    });
    twimlResponse(res, `Broadcast failed. Check nonce status and re-run presign if needed.`);
  }
});

// -----------------------------------------------------------
// POST /admin/reply-sms
// Elena's tool: send a follow-up SMS after handling WU manually.
// Bearer auth: Authorization: Bearer ADMIN_SECRET
// Body: { phone: string, message: string }
// -----------------------------------------------------------

app.post("/admin/reply-sms", async (req, res) => {
  const secret = req.headers.authorization?.replace("Bearer ", "");
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { phone, message } = req.body;
  if (!phone || !message) {
    res.status(400).json({ error: "phone and message required" });
    return;
  }

  try {
    await sendSms(phone, message);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------
// GET /admin/pending-cash
// Returns recent cash_executed audit entries so Elena can see
// outstanding cash jobs without opening Supabase.
// Bearer auth: Authorization: Bearer ADMIN_SECRET
// -----------------------------------------------------------

app.get("/admin/pending-cash", async (req, res) => {
  const secret = req.headers.authorization?.replace("Bearer ", "");
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { data, error } = await supabase
    .from("panic_audit")
    .select("id, created_at, details")
    .eq("action", "cash_executed")
    .eq("success", true)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) { res.status(500).json({ error: error.message }); return; }

  res.json({ ok: true, data });
});

// -----------------------------------------------------------
// Start
// -----------------------------------------------------------

app.listen(PORT, () => {
  console.log(`[afterself-panic] Hosted server listening on port ${PORT}`);
  console.log(`[afterself-panic] Twilio webhook: POST http://your-domain/sms`);
});
