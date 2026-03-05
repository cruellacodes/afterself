// ============================================================
// Afterself — Panic Button (CLI)
// SMS-triggered emergency SOL transfer. Set up codes during
// peacetime, execute via SMS when internet is unavailable.
// Called by the OpenClaw agent or sms-webhook.
// ============================================================

import { createHash } from "crypto";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  STATE_DIR,
  loadConfig,
  saveConfig,
  appendAudit,
  output,
  fail,
} from "./utils.js";

const DEFAULT_WALLET_PATH = join(STATE_DIR, "wallet.json");
const MAX_ACTIONS = 5;

// -----------------------------------------------------------
// Crypto Helpers
// -----------------------------------------------------------

/** SHA-256 hash a string, return hex */
function hashCode(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}

/** Validate a Solana public key string */
function isValidPubkey(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

// -----------------------------------------------------------
// Solana Helpers
// -----------------------------------------------------------

function loadKeypair(): Keypair {
  const config = loadConfig();
  const keypairPath = config.mortalityPool?.keypairPath || DEFAULT_WALLET_PATH;

  if (!existsSync(keypairPath)) {
    throw new Error(
      `Keypair not found at ${keypairPath}. Run mortality.js create-wallet first.`
    );
  }

  const raw = readFileSync(keypairPath, "utf-8");
  const secretKey = Uint8Array.from(JSON.parse(raw));
  return Keypair.fromSecretKey(secretKey);
}

function getConnection(): Connection {
  const config = loadConfig();
  return new Connection(
    config.mortalityPool?.rpcUrl || "https://api.mainnet-beta.solana.com",
    "confirmed"
  );
}

// -----------------------------------------------------------
// Commands
// -----------------------------------------------------------

/** Set up a new panic action: hash the code, store label + destination */
function setup(label: string, destination: string, code: string): void {
  const config = loadConfig();

  if (!config.panic) {
    config.panic = { enabled: false, actions: [], cooldownSeconds: 60 };
  }

  if (config.panic.actions.length >= MAX_ACTIONS) {
    fail(`Maximum ${MAX_ACTIONS} panic actions allowed. Revoke one first.`);
  }

  if (!isValidPubkey(destination)) {
    fail(`Invalid Solana address: ${destination}`);
  }

  // Check for duplicate label
  if (config.panic.actions.some((a) => a.label === label)) {
    fail(`Action with label "${label}" already exists. Revoke it first.`);
  }

  const codeHash = hashCode(code);

  config.panic.actions.push({
    label,
    codeHash,
    destination,
    asset: "sol",
    createdAt: new Date().toISOString(),
  });

  config.panic.enabled = true;
  saveConfig(config);

  appendAudit("panic", "setup", { label, destination });

  output({
    label,
    destination,
    message: `Panic action "${label}" configured. Memorize your code — it is not stored.`,
  });
}

/** List all configured panic actions (never show codes) */
function list(): void {
  const config = loadConfig();
  const actions = config.panic?.actions || [];

  output(
    actions.map((a) => ({
      label: a.label,
      destination: a.destination,
      asset: a.asset,
      createdAt: a.createdAt,
    }))
  );
}

/** Verify a code and execute the matching SOL transfer */
async function verify(code: string, dryRun: boolean = false): Promise<void> {
  const config = loadConfig();

  if (!config.panic?.enabled || config.panic.actions.length === 0) {
    fail("No panic actions configured. Run setup first.");
  }

  // Rate limiting
  if (config.panic.lastAttempt) {
    const elapsed = Date.now() - new Date(config.panic.lastAttempt).getTime();
    const cooldownMs = (config.panic.cooldownSeconds || 60) * 1000;
    if (elapsed < cooldownMs) {
      const waitSec = Math.ceil((cooldownMs - elapsed) / 1000);
      appendAudit("panic", "rate_limited", { waitSec }, false);
      fail(`Rate limited. Try again in ${waitSec}s.`);
    }
  }

  // Record attempt timestamp
  config.panic.lastAttempt = new Date().toISOString();
  saveConfig(config);

  const incoming = hashCode(code);
  const match = config.panic.actions.find((a) => a.codeHash === incoming);

  if (!match) {
    appendAudit("panic", "verify_failed", { reason: "no_match" }, false);
    fail("Invalid code.");
  }

  if (dryRun) {
    output({
      label: match.label,
      destination: match.destination,
      dryRun: true,
      message: `Code matches "${match.label}". No transfer executed (dry run).`,
    });
    return;
  }

  // Execute the transfer
  try {
    const keypair = loadKeypair();
    const connection = getConnection();
    const destination = new PublicKey(match.destination);

    // Get balance (in lamports)
    const balance = await connection.getBalance(keypair.publicKey);

    if (balance === 0) {
      appendAudit("panic", "verify_failed", { reason: "zero_balance", label: match.label }, false);
      fail("Wallet balance is 0 SOL. Nothing to transfer.");
    }

    // Reserve a small amount for the transaction fee (5000 lamports)
    const fee = 5000;
    const transferAmount = balance - fee;

    if (transferAmount <= 0) {
      appendAudit("panic", "verify_failed", { reason: "insufficient_for_fee", label: match.label }, false);
      fail("Balance too low to cover transaction fee.");
    }

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: destination,
        lamports: transferAmount,
      })
    );

    const txSignature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [keypair]
    );

    const solAmount = transferAmount / LAMPORTS_PER_SOL;

    appendAudit("panic", "executed", {
      label: match.label,
      destination: match.destination,
      amount: solAmount,
      txSignature,
    });

    output({
      label: match.label,
      destination: match.destination,
      amount: solAmount,
      txSignature,
      message: `Done. ${solAmount} SOL sent to ${match.destination}.`,
    });
  } catch (err: any) {
    appendAudit("panic", "execution_failed", {
      label: match.label,
      error: err.message,
    }, false);
    fail(`Transfer failed: ${err.message}`);
  }
}

/** Revoke a specific panic action by label */
function revoke(label: string): void {
  const config = loadConfig();

  if (!config.panic) {
    fail("No panic actions configured.");
  }

  const before = config.panic.actions.length;
  config.panic.actions = config.panic.actions.filter((a) => a.label !== label);

  if (config.panic.actions.length === before) {
    fail(`No action found with label "${label}".`);
  }

  if (config.panic.actions.length === 0) {
    config.panic.enabled = false;
  }

  saveConfig(config);
  appendAudit("panic", "revoked", { label });
  output({ label, message: `Panic action "${label}" revoked.` });
}

/** Revoke all panic actions */
function revokeAll(): void {
  const config = loadConfig();

  if (!config.panic || config.panic.actions.length === 0) {
    fail("No panic actions to revoke.");
  }

  const count = config.panic.actions.length;
  config.panic.actions = [];
  config.panic.enabled = false;
  saveConfig(config);

  appendAudit("panic", "revoked_all", { count });
  output({ count, message: `All ${count} panic action(s) revoked.` });
}

/** Register phone hash for SMS verification */
function registerPhone(phone: string): void {
  const config = loadConfig();

  if (!config.panic) {
    config.panic = { enabled: false, actions: [], cooldownSeconds: 60 };
  }

  config.panic.phoneHash = hashCode(phone);
  saveConfig(config);

  appendAudit("panic", "phone_registered", {});
  output({ message: "Phone registered. Hash stored — number is not saved." });
}

// -----------------------------------------------------------
// CLI
// -----------------------------------------------------------

function parseArgs(args: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--") && i + 1 < args.length) {
      parsed[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return parsed;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const flags = parseArgs(args.slice(1));

  try {
    switch (command) {
      case "setup": {
        const { label, destination, code } = flags;
        if (!label || !destination || !code) {
          fail("Usage: panic.js setup --label <name> --destination <wallet> --code <secret>");
        }
        setup(label, destination, code);
        break;
      }

      case "list": {
        list();
        break;
      }

      case "verify": {
        const { code } = flags;
        if (!code) {
          fail("Usage: panic.js verify --code <secret>");
        }
        await verify(code);
        break;
      }

      case "test": {
        const { code } = flags;
        if (!code) {
          fail("Usage: panic.js test --code <secret>");
        }
        await verify(code, true);
        break;
      }

      case "revoke": {
        const { label } = flags;
        if (!label) {
          fail("Usage: panic.js revoke --label <name>");
        }
        revoke(label);
        break;
      }

      case "revoke-all": {
        revokeAll();
        break;
      }

      case "register-phone": {
        const { phone } = flags;
        if (!phone) {
          fail("Usage: panic.js register-phone --phone <number>");
        }
        registerPhone(phone);
        break;
      }

      default: {
        fail(
          `Unknown command: ${command}\n` +
          `Available commands: setup, list, verify, test, revoke, revoke-all, register-phone`
        );
      }
    }
  } catch (err: any) {
    fail(err.message || String(err));
  }
}

// -----------------------------------------------------------
// Exports (for sms-webhook.ts to import)
// -----------------------------------------------------------

export { hashCode, verify, list, setup, revoke, revokeAll, registerPhone };

// Only run CLI when this is the entry point
import { fileURLToPath } from "url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
