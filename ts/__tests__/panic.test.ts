import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHash } from "crypto";
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join } from "path";

// We test panic logic by manipulating the config file directly
// and importing the shared utilities.

const TEST_DIR = join(process.env.HOME || "~", ".afterself-test");
const TEST_CONFIG = join(TEST_DIR, "config.json");
const TEST_AUDIT = join(TEST_DIR, "audit.jsonl");

// Override STATE_DIR before importing utils
vi.mock("../utils.js", async () => {
  const { createHash: ch } = await import("crypto");
  const { randomUUID } = await import("crypto");
  const { readFileSync: rfs, writeFileSync: wfs, existsSync: es, mkdirSync: mds } = await import("fs");
  const { join: j } = await import("path");

  const STATE_DIR = j(process.env.HOME || "~", ".afterself-test");
  const STATE_FILE = j(STATE_DIR, "state.json");
  const AUDIT_FILE = j(STATE_DIR, "audit.jsonl");
  const CONFIG_FILE = j(STATE_DIR, "config.json");

  function ensureDir(): void {
    if (!es(STATE_DIR)) {
      mds(STATE_DIR, { recursive: true, mode: 0o700 });
    }
  }

  function defaultConfig() {
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
        dbPath: j(STATE_DIR, "vault.enc"),
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

  function loadConfig() {
    ensureDir();
    if (!es(CONFIG_FILE)) return defaultConfig();
    try {
      const raw = rfs(CONFIG_FILE, "utf-8");
      return { ...defaultConfig(), ...JSON.parse(raw) };
    } catch {
      return defaultConfig();
    }
  }

  function saveConfig(config: any): void {
    ensureDir();
    wfs(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
  }

  function appendAudit(type: string, action: string, details: any = {}, success = true) {
    ensureDir();
    const entry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type,
      action,
      details,
      success,
    };
    const line = JSON.stringify(entry) + "\n";
    wfs(AUDIT_FILE, line, { flag: "a", mode: 0o600 });
    return entry;
  }

  function readAuditLog(limit = 50) {
    if (!es(AUDIT_FILE)) return [];
    try {
      const raw = rfs(AUDIT_FILE, "utf-8");
      const lines = raw.trim().split("\n").filter(Boolean);
      return lines
        .slice(-limit)
        .map((line: string) => JSON.parse(line))
        .reverse();
    } catch {
      return [];
    }
  }

  function output(data: unknown): void {
    console.log(JSON.stringify({ ok: true, data }, null, 2));
  }

  function fail(message: string): never {
    throw new Error(message);
  }

  function parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)(m|h|d)$/);
    if (!match) throw new Error(`Invalid duration: ${duration}`);
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case "m": return value * 60 * 1000;
      case "h": return value * 60 * 60 * 1000;
      case "d": return value * 24 * 60 * 60 * 1000;
      default: throw new Error(`Unknown unit: ${unit}`);
    }
  }

  function formatDuration(ms: number): string {
    const hours = Math.floor(ms / (60 * 60 * 1000));
    if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h`;
    return `${Math.floor(ms / (60 * 1000))}m`;
  }

  return {
    STATE_DIR,
    STATE_FILE,
    AUDIT_FILE,
    CONFIG_FILE,
    ensureDir,
    defaultConfig,
    loadConfig,
    saveConfig,
    appendAudit,
    readAuditLog,
    output,
    fail,
    parseDuration,
    formatDuration,
  };
});

// Helper
function sha256(input: string): string {
  return createHash("sha256").update(input.trim()).digest("hex");
}

function cleanTestDir(): void {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

function readConfig(): any {
  if (!existsSync(TEST_CONFIG)) return null;
  return JSON.parse(readFileSync(TEST_CONFIG, "utf-8"));
}

function writeConfig(config: any): void {
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true, mode: 0o700 });
  }
  writeFileSync(TEST_CONFIG, JSON.stringify(config, null, 2), { mode: 0o600 });
}

function readAuditEntries(): any[] {
  if (!existsSync(TEST_AUDIT)) return [];
  const raw = readFileSync(TEST_AUDIT, "utf-8");
  return raw.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

describe("Panic Button", () => {
  beforeEach(() => {
    cleanTestDir();
  });

  afterEach(() => {
    cleanTestDir();
    vi.restoreAllMocks();
  });

  describe("setup", async () => {
    const { setup, list } = await import("../panic.js");

    it("should store a hashed code with label and destination", async () => {
      const { loadConfig, saveConfig } = await import("../utils.js");

      // Suppress console.log output
      vi.spyOn(console, "log").mockImplementation(() => {});

      setup("wife", "11111111111111111111111111111111", "ALPHA");

      const config = loadConfig();
      expect(config.panic.enabled).toBe(true);
      expect(config.panic.actions).toHaveLength(1);
      expect(config.panic.actions[0].label).toBe("wife");
      expect(config.panic.actions[0].destination).toBe("11111111111111111111111111111111");
      expect(config.panic.actions[0].codeHash).toBe(sha256("ALPHA"));
      expect(config.panic.actions[0].asset).toBe("sol");
    });

    it("should reject more than 5 actions", async () => {
      const { loadConfig, saveConfig } = await import("../utils.js");

      vi.spyOn(console, "log").mockImplementation(() => {});

      // Pre-fill with 5 actions
      const config = loadConfig();
      config.panic = {
        enabled: true,
        actions: Array.from({ length: 5 }, (_, i) => ({
          label: `action${i}`,
          codeHash: sha256(`CODE${i}`),
          destination: "11111111111111111111111111111111",
          asset: "sol" as const,
          createdAt: new Date().toISOString(),
        })),
        cooldownSeconds: 60,
      };
      saveConfig(config);

      expect(() => setup("sixth", "11111111111111111111111111111111", "CODE5")).toThrow(
        /Maximum 5/
      );
    });

    it("should reject invalid Solana address", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});

      expect(() => setup("test", "not-a-valid-address", "CODE")).toThrow(/Invalid Solana address/);
    });

    it("should reject duplicate labels", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});

      setup("wife", "11111111111111111111111111111111", "ALPHA");
      expect(() => setup("wife", "11111111111111111111111111111111", "BETA")).toThrow(
        /already exists/
      );
    });
  });

  describe("verify", async () => {
    const { setup, verify } = await import("../panic.js");

    it("should match correct code in dry run", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});

      setup("wife", "11111111111111111111111111111111", "ALPHA");

      // Dry run should not throw
      await verify("ALPHA", true);
    });

    it("should reject wrong code", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});

      setup("wife", "11111111111111111111111111111111", "ALPHA");

      await expect(verify("WRONG", true)).rejects.toThrow(/Invalid code/);
    });

    it("should enforce rate limiting", async () => {
      const { loadConfig, saveConfig } = await import("../utils.js");

      vi.spyOn(console, "log").mockImplementation(() => {});

      setup("wife", "11111111111111111111111111111111", "ALPHA");

      // Set last attempt to now
      const config = loadConfig();
      config.panic.lastAttempt = new Date().toISOString();
      config.panic.cooldownSeconds = 120;
      saveConfig(config);

      await expect(verify("ALPHA", true)).rejects.toThrow(/Rate limited/);
    });

    it("should reject when no actions configured", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});

      await expect(verify("ALPHA", true)).rejects.toThrow(/No panic actions configured/);
    });
  });

  describe("revoke", async () => {
    const { setup, revoke, revokeAll } = await import("../panic.js");

    it("should remove a specific action by label", async () => {
      const { loadConfig } = await import("../utils.js");

      vi.spyOn(console, "log").mockImplementation(() => {});

      setup("wife", "11111111111111111111111111111111", "ALPHA");
      setup("brother", "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "BETA");

      expect(loadConfig().panic.actions).toHaveLength(2);

      revoke("wife");

      const config = loadConfig();
      expect(config.panic.actions).toHaveLength(1);
      expect(config.panic.actions[0].label).toBe("brother");
    });

    it("should reject revoking non-existent label", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});

      setup("wife", "11111111111111111111111111111111", "ALPHA");

      expect(() => revoke("nonexistent")).toThrow(/No action found/);
    });

    it("should disable panic when last action is revoked", async () => {
      const { loadConfig } = await import("../utils.js");

      vi.spyOn(console, "log").mockImplementation(() => {});

      setup("wife", "11111111111111111111111111111111", "ALPHA");
      revoke("wife");

      expect(loadConfig().panic.enabled).toBe(false);
      expect(loadConfig().panic.actions).toHaveLength(0);
    });

    it("should revoke all actions", async () => {
      const { loadConfig } = await import("../utils.js");

      vi.spyOn(console, "log").mockImplementation(() => {});

      setup("wife", "11111111111111111111111111111111", "ALPHA");
      setup("brother", "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "BETA");

      revokeAll();

      expect(loadConfig().panic.enabled).toBe(false);
      expect(loadConfig().panic.actions).toHaveLength(0);
    });
  });

  describe("registerPhone", async () => {
    const { registerPhone } = await import("../panic.js");

    it("should store phone as hash", async () => {
      const { loadConfig } = await import("../utils.js");

      vi.spyOn(console, "log").mockImplementation(() => {});

      registerPhone("+15551234567");

      const config = loadConfig();
      expect(config.panic.phoneHash).toBe(sha256("+15551234567"));
    });
  });

  describe("audit trail", async () => {
    const { setup, revoke } = await import("../panic.js");

    it("should log setup and revoke to audit", async () => {
      const { readAuditLog } = await import("../utils.js");

      vi.spyOn(console, "log").mockImplementation(() => {});

      setup("wife", "11111111111111111111111111111111", "ALPHA");
      revoke("wife");

      const entries = readAuditLog();
      const panicEntries = entries.filter((e: any) => e.type === "panic");

      expect(panicEntries).toHaveLength(2);
      expect(panicEntries.find((e: any) => e.action === "setup")).toBeTruthy();
      expect(panicEntries.find((e: any) => e.action === "revoked")).toBeTruthy();
    });
  });
});
