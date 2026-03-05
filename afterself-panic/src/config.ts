// ============================================================
// afterself-panic — Config & Audit Utilities
// Self-contained — no dependency on the afterself skill.
// ============================================================

import type { PanicConfig, AuditEntry } from "./types.js";
import { randomUUID } from "crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// -----------------------------------------------------------
// Paths
// -----------------------------------------------------------

export const STATE_DIR = join(process.env.HOME || "~", ".afterself-panic");
export const CONFIG_FILE = join(STATE_DIR, "config.json");
export const AUDIT_FILE = join(STATE_DIR, "audit.jsonl");

/** Ensure the data directory exists */
export function ensureDir(): void {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  }
}

// -----------------------------------------------------------
// Default Config
// -----------------------------------------------------------

export function defaultConfig(): PanicConfig {
  return {
    enabled: false,
    actions: [],
    cooldownSeconds: 60,
    rpcUrl: "https://api.mainnet-beta.solana.com",
  };
}

// -----------------------------------------------------------
// Config Operations
// -----------------------------------------------------------

export function loadConfig(): PanicConfig {
  ensureDir();
  if (!existsSync(CONFIG_FILE)) return defaultConfig();

  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    return { ...defaultConfig(), ...JSON.parse(raw) };
  } catch {
    return defaultConfig();
  }
}

export function saveConfig(config: PanicConfig): void {
  ensureDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

// -----------------------------------------------------------
// Audit Log (append-only JSONL)
// -----------------------------------------------------------

export function appendAudit(
  action: string,
  details: Record<string, unknown> = {},
  success: boolean = true
): AuditEntry {
  ensureDir();
  const entry: AuditEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    type: success ? "panic" : "error",
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
// CLI Helpers
// -----------------------------------------------------------

export function output(data: unknown): void {
  console.log(JSON.stringify({ ok: true, data }, null, 2));
}

export function fail(message: string): never {
  console.log(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exit(1);
}
