// ============================================================
// Afterself — SMS Webhook (Twilio)
// Minimal HTTP server that receives SMS via Twilio POST,
// verifies the emergency code, and executes the panic transfer.
// No Express — just Node.js http module.
// ============================================================

import { createServer, IncomingMessage, ServerResponse } from "http";
import { loadConfig, appendAudit } from "./utils.js";
import { hashCode, verify } from "./panic.js";

const DEFAULT_PORT = 3141;

// -----------------------------------------------------------
// Twilio Helpers
// -----------------------------------------------------------

/** Parse URL-encoded form body (Twilio sends application/x-www-form-urlencoded) */
function parseFormBody(body: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const pair of body.split("&")) {
    const [key, value] = pair.split("=");
    if (key && value !== undefined) {
      params[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, " "));
    }
  }
  return params;
}

/** Return a TwiML XML response */
function twiml(res: ServerResponse, message: string): void {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`;
  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(xml);
}

/** Read the full request body */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// -----------------------------------------------------------
// Request Handler
// -----------------------------------------------------------

async function handleSms(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readBody(req);
  const params = parseFormBody(body);

  const smsBody = (params.Body || "").trim();
  const from = params.From || "";

  if (!smsBody) {
    appendAudit("panic", "sms_empty", { from: from ? hashCode(from) : "unknown" }, false);
    twiml(res, "No code received.");
    return;
  }

  // Optional: verify phone hash matches registered phone
  const config = loadConfig();
  if (config.panic?.phoneHash && from) {
    const fromHash = hashCode(from);
    if (fromHash !== config.panic.phoneHash) {
      appendAudit("panic", "sms_unauthorized", { fromHash }, false);
      twiml(res, "Unauthorized number.");
      return;
    }
  }

  // Capture output instead of letting it go to stdout
  const originalLog = console.log;
  let capturedOutput = "";
  console.log = (msg: string) => { capturedOutput = msg; };

  try {
    await verify(smsBody);
    console.log = originalLog;

    // Parse the captured JSON to get the label
    let label = "unknown";
    try {
      const parsed = JSON.parse(capturedOutput);
      if (parsed?.data?.label) label = parsed.data.label;
    } catch { /* ignore parse errors */ }

    appendAudit("panic", "sms_executed", { label, fromHash: from ? hashCode(from) : "unknown" });
    twiml(res, `Done. ${label} executed.`);
  } catch {
    console.log = originalLog;
    appendAudit("panic", "sms_failed", { fromHash: from ? hashCode(from) : "unknown" }, false);
    twiml(res, "Invalid code.");
  }
}

async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Health check
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "afterself-panic-sms" }));
    return;
  }

  // SMS endpoint
  if (req.method === "POST" && req.url === "/sms") {
    await handleSms(req, res);
    return;
  }

  // 404
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
}

// -----------------------------------------------------------
// Server
// -----------------------------------------------------------

function main(): void {
  const port = parseInt(process.env.PORT || String(DEFAULT_PORT), 10);

  const server = createServer(async (req, res) => {
    try {
      await handler(req, res);
    } catch (err: any) {
      console.error(`[afterself-sms] Error: ${err.message}`);
      if (!res.headersSent) {
        twiml(res, "Internal error.");
      }
    }
  });

  server.listen(port, () => {
    console.log(`[afterself-sms] Listening on port ${port}`);
    console.log(`[afterself-sms] Twilio webhook URL: POST http://your-server:${port}/sms`);
  });
}

// Only run when this is the entry point
import { fileURLToPath } from "url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
