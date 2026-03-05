// ============================================================
// Afterself — Shared Utilities
// Used by state.ts, panic.ts, and sms-webhook.ts.
// ============================================================

import type { AfterselfConfig, AuditEntry } from "./types.js";
import { randomUUID } from "crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// -----------------------------------------------------------
// Paths
// -----------------------------------------------------------

export const STATE_DIR = join(process.env.HOME || "~", ".afterself");
export const STATE_FILE = join(STATE_DIR, "state.json");
export const AUDIT_FILE = join(STATE_DIR, "audit.jsonl");
export const CONFIG_FILE = join(STATE_DIR, "config.json");

/** Ensure the data directory exists */
export function ensureDir(): void {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  }
}

// -----------------------------------------------------------
// Default Config
// -----------------------------------------------------------

export function defaultConfig(): AfterselfConfig {
  return {
    heartbeat: {
      interval: "72h",
      channels: ["whatsapp"],
      warningPeriod: "24h",
      escalationTimeout: "48h",
      escalationContacts: [],
    },
    vault: {
      encryption: "aes-256-gcm",
      beneficiaryKeyEnabled: true,
      dbPath: join(STATE_DIR, "vault.enc"),
      backupPath: undefined,
    },
    executor: {
      enabled: true,
      confirmationGate: true,
      auditLog: true,
      maxRetries: 3,
      actionDelay: 5000,
    },
    ghost: {
      enabled: false,
      learning: false,
      transparency: true,
      voiceEnabled: false,
      socialPosting: false,
      timeDecay: { enabled: true, fadeOverDays: 90 },
      killSwitchContacts: [],
      blockedTopics: [],
    },
    llm: {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      maxTokens: 500,
      temperature: 0.7,
    },
    mortalityPool: {
      enabled: false,
      poolWallet: "6J8AwTGc8ys9L7Z8dC7Wcd8AbmPxyKpZH8nXu4BrB5md",
      tokenMint: "EXAMPLE_TOKEN_MINT_ADDRESS",
      rpcUrl: "https://api.mainnet-beta.solana.com",
      nudgeEnabled: true,
    },
    panic: {
      enabled: false,
      actions: [],
      cooldownSeconds: 60,
    },
  };
}

// -----------------------------------------------------------
// Config Operations
// -----------------------------------------------------------

export function loadConfig(): AfterselfConfig {
  ensureDir();
  if (!existsSync(CONFIG_FILE)) return defaultConfig();

  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    return { ...defaultConfig(), ...JSON.parse(raw) };
  } catch {
    return defaultConfig();
  }
}

export function saveConfig(config: AfterselfConfig): void {
  ensureDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

// -----------------------------------------------------------
// Audit Log (append-only JSONL)
// -----------------------------------------------------------

export function appendAudit(
  type: AuditEntry["type"],
  action: string,
  details: Record<string, unknown> = {},
  success: boolean = true
): AuditEntry {
  ensureDir();
  const entry: AuditEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    type,
    action,
    details,
    success,
  };

  const line = JSON.stringify(entry) + "\n";
  writeFileSync(AUDIT_FILE, line, { flag: "a", mode: 0o600 });
  return entry;
}

export function readAuditLog(limit: number = 50): AuditEntry[] {
  if (!existsSync(AUDIT_FILE)) return [];

  try {
    const raw = readFileSync(AUDIT_FILE, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);
    return lines
      .slice(-limit)
      .map((line) => JSON.parse(line) as AuditEntry)
      .reverse();
  } catch {
    return [];
  }
}

// -----------------------------------------------------------
// Duration Parsing
// -----------------------------------------------------------

/** Parse a duration string like "72h", "7d", "30m" into milliseconds */
export function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)(m|h|d)$/);
  if (!match) throw new Error(`Invalid duration: ${duration}`);

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "m": return value * 60 * 1000;
    case "h": return value * 60 * 60 * 1000;
    case "d": return value * 24 * 60 * 60 * 1000;
    default:  throw new Error(`Unknown unit: ${unit}`);
  }
}

/** Format milliseconds as a human-readable duration */
export function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h`;
  return `${Math.floor(ms / (60 * 1000))}m`;
}

// -----------------------------------------------------------
// CLI Helpers
// -----------------------------------------------------------

export function output(data: unknown): void {
  console.log(JSON.stringify({ ok: true, data }, null, 2));
}

export function fail(message: string): never {
  console.log(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exit(1);
}
