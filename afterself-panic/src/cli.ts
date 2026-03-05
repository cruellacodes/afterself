#!/usr/bin/env node
// ============================================================
// afterself-panic — CLI Entry Point
// ============================================================

import {
  presign,
  presignCash,
  list,
  verify,
  revoke,
  revokeAll,
  registerPhone,
  nonceStatus,
  setRpc,
  setKeypair,
  setApi,
  registerWithServer,
  loadKeypair,
  getConnection,
} from "./panic.js";
import { createNonceAccount, lamportsToSol } from "./nonce.js";
import { fail, output } from "./config.js";
import * as readline from "readline";

// -----------------------------------------------------------
// Helpers
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

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

// -----------------------------------------------------------
// Presign Wizard — interactive setup
// -----------------------------------------------------------

async function presignWizard(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });

  console.error("\nafterself-panic setup wizard");
  console.error("─────────────────────────────");

  let keypair;
  try {
    keypair = loadKeypair();
  } catch (err: any) {
    rl.close();
    fail(err.message);
  }

  const connection = getConnection();
  const balance = await connection.getBalance(keypair.publicKey);
  const balanceSol = lamportsToSol(balance);

  console.error(`Wallet:  ${keypair.publicKey.toBase58()}`);
  console.error(`Balance: ${balanceSol} SOL\n`);

  if (balance < 10000) {
    rl.close();
    fail("Wallet balance too low. Fund the wallet first (need at least ~0.002 SOL).");
  }

  const label = (await ask(rl, "Label (e.g. wife, burn, brother): ")).trim();
  if (!label) { rl.close(); fail("Label cannot be empty."); }

  // Mode selection
  console.error("\nMode:");
  console.error("  [1] Wallet — SOL sent to your configured address");
  console.error("  [2] Cash   — SOL sent to escrow; Western Union pickup details sent by SMS");
  const modeStr = (await ask(rl, "Choose [1/2]: ")).trim();
  const isCash = modeStr === "2";

  if (isCash) {
    // Cash mode: collect WU recipient details
    const receiverName = (await ask(rl, "Recipient full name (for WU ID match): ")).trim();
    if (!receiverName) { rl.close(); fail("Receiver name cannot be empty."); }

    const country = (await ask(rl, "Pickup country (e.g. Greece): ")).trim();
    if (!country) { rl.close(); fail("Country cannot be empty."); }

    const currency = (await ask(rl, "Pickup currency (e.g. EUR): ")).trim().toUpperCase();
    if (!currency) { rl.close(); fail("Currency cannot be empty."); }

    const amountStr = (await ask(rl, "Amount in SOL (or 'all' for full balance): ")).trim();
    const amountSol: number | "all" = amountStr === "all" ? "all" : parseFloat(amountStr);
    if (amountStr !== "all" && isNaN(amountSol as number)) { rl.close(); fail("Invalid amount."); }

    const code1 = (await ask(rl, "Emergency code: ")).trim();
    if (!code1) { rl.close(); fail("Code cannot be empty."); }

    const code2 = (await ask(rl, "Confirm code: ")).trim();
    if (code1 !== code2) { rl.close(); fail("Codes do not match."); }

    rl.close();
    console.error("");
    await presignCash(label, code1, receiverName, country, currency, amountSol);
  } else {
    // Wallet mode: existing flow
    const destination = (await ask(rl, "Destination wallet address: ")).trim();

    const amountStr = (await ask(rl, "Amount in SOL (or 'all' for full balance): ")).trim();
    const amountSol: number | "all" = amountStr === "all" ? "all" : parseFloat(amountStr);
    if (amountStr !== "all" && isNaN(amountSol as number)) {
      rl.close();
      fail("Invalid amount.");
    }

    const code1 = (await ask(rl, "Emergency code: ")).trim();
    if (!code1) { rl.close(); fail("Code cannot be empty."); }

    const code2 = (await ask(rl, "Confirm code: ")).trim();
    if (code1 !== code2) { rl.close(); fail("Codes do not match."); }

    rl.close();
    console.error("");
    await presign(label, destination, amountSol, code1);
  }
}

// -----------------------------------------------------------
// Main
// -----------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const flags = parseArgs(args.slice(1));

  try {
    switch (command) {
      case "presign": {
        // If flags provided, use them directly (non-interactive)
        if (flags.label && flags.destination && flags.code) {
          const amount: number | "all" =
            flags.amount === "all" ? "all" : parseFloat(flags.amount || "0");
          if (flags.amount !== "all" && isNaN(amount as number)) {
            fail("Invalid --amount. Use a number or 'all'.");
          }
          await presign(flags.label, flags.destination, amount, flags.code);
        } else {
          // Interactive wizard
          await presignWizard();
        }
        break;
      }

      case "list": {
        list();
        break;
      }

      case "verify": {
        const { code } = flags;
        if (!code) fail("Usage: afterself-panic verify --code <secret>");
        await verify(code);
        break;
      }

      case "test": {
        const { code } = flags;
        if (!code) fail("Usage: afterself-panic test --code <secret>");
        await verify(code, true);
        break;
      }

      case "nonce-setup": {
        const keypair = loadKeypair();
        const connection = getConnection();
        console.error("Creating nonce account...");
        const noncePubkey = await createNonceAccount(connection, keypair);
        output({
          nonceAccount: noncePubkey.toBase58(),
          message: "Nonce account created.",
        });
        break;
      }

      case "nonce-status": {
        const { label } = flags;
        if (!label) fail("Usage: afterself-panic nonce-status --label <name>");
        await nonceStatus(label);
        break;
      }

      case "revoke": {
        const { label } = flags;
        if (!label) fail("Usage: afterself-panic revoke --label <name>");
        await revoke(label);
        break;
      }

      case "revoke-all": {
        await revokeAll();
        break;
      }

      case "register-phone": {
        const { phone } = flags;
        if (!phone) fail("Usage: afterself-panic register-phone --phone <number>");
        registerPhone(phone);
        break;
      }

      case "set-rpc": {
        const { url } = flags;
        if (!url) fail("Usage: afterself-panic set-rpc --url <rpc-url>");
        setRpc(url);
        break;
      }

      case "set-keypair": {
        const { path } = flags;
        if (!path) fail("Usage: afterself-panic set-keypair --path <keypair.json>");
        setKeypair(path);
        break;
      }

      case "set-api": {
        const { url } = flags;
        if (!url) fail("Usage: afterself-panic set-api --url <url>");
        setApi(url);
        break;
      }

      case "register": {
        const { phone } = flags;
        if (!phone) fail("Usage: afterself-panic register --phone <+number>");
        await registerWithServer(phone);
        break;
      }

      default: {
        console.log(`
afterself-panic — Trustless SMS-triggered SOL transfer

  Your keys never leave your device.
  You sign during peacetime. SMS fires when it matters.

Hosted setup (recommended):
  set-api        Set hosted service URL
  register       Register your phone with hosted service
  presign        Sign your transfer — uploads to hosted server automatically

Commands:
  presign        Interactive setup wizard (recommended)
  presign --label <n> --destination <w> --amount <s> --code <c>
                 Non-interactive presign
  list           List configured actions
  verify         Broadcast pre-signed tx if code matches
  test           Dry run — verify without broadcasting
  revoke         Remove a specific action
  revoke-all     Remove all actions
  nonce-setup    Create a nonce account only
  nonce-status   Check if stored transaction is still valid
  register-phone Register phone for self-hosted SMS verification
  set-api        Set hosted API URL
  register       Register with hosted service
  set-rpc        Set Solana RPC endpoint
  set-keypair    Set path to Solana keypair file

Examples:
  afterself-panic set-api --url https://afterself-panic.onrender.com
  afterself-panic register --phone +447911123456
  afterself-panic presign
  afterself-panic test --code ESCAPE
  afterself-panic list

Docs: https://afterself.xyz/panic.html
`);
        break;
      }
    }
  } catch (err: any) {
    fail(err.message || String(err));
  }
}

main();
