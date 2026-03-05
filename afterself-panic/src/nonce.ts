// ============================================================
// afterself-panic — Durable Nonce Utilities
// Creates nonce accounts and builds pre-signed durable nonce
// transactions that can be stored and broadcast later via SMS.
// ============================================================

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  NONCE_ACCOUNT_LENGTH,
  NonceAccount,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

// -----------------------------------------------------------
// Nonce Account Management
// -----------------------------------------------------------

/**
 * Create a new nonce account controlled by the given authority.
 * Costs ~0.00136 SOL (rent-exempt minimum).
 * Returns the new nonce account pubkey.
 */
export async function createNonceAccount(
  connection: Connection,
  feePayer: Keypair
): Promise<PublicKey> {
  const nonceKeypair = Keypair.generate();

  const rentExempt = await connection.getMinimumBalanceForRentExemption(
    NONCE_ACCOUNT_LENGTH
  );

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: feePayer.publicKey,
      newAccountPubkey: nonceKeypair.publicKey,
      lamports: rentExempt,
      space: NONCE_ACCOUNT_LENGTH,
      programId: SystemProgram.programId,
    }),
    SystemProgram.nonceInitialize({
      noncePubkey: nonceKeypair.publicKey,
      authorizedPubkey: feePayer.publicKey,
    })
  );

  await sendAndConfirmTransaction(connection, tx, [feePayer, nonceKeypair]);

  return nonceKeypair.publicKey;
}

/**
 * Read the current nonce value from a nonce account.
 */
export async function getNonceValue(
  connection: Connection,
  noncePubkey: PublicKey
): Promise<string> {
  const accountInfo = await connection.getAccountInfo(noncePubkey);
  if (!accountInfo) {
    throw new Error(`Nonce account not found: ${noncePubkey.toBase58()}`);
  }

  const nonceAccount = NonceAccount.fromAccountData(accountInfo.data);
  return nonceAccount.nonce;
}

/**
 * Check whether a nonce account still holds the expected nonce value.
 * Returns false if the nonce has been advanced (tx would be invalid).
 */
export async function isNonceValid(
  connection: Connection,
  noncePubkey: PublicKey,
  expectedNonce: string
): Promise<boolean> {
  try {
    const current = await getNonceValue(connection, noncePubkey);
    return current === expectedNonce;
  } catch {
    return false;
  }
}

// -----------------------------------------------------------
// Durable Nonce Transaction Builder
// -----------------------------------------------------------

/**
 * Build and sign a durable nonce SOL transfer transaction.
 * The transaction is signed but NOT broadcast.
 * Returns base64-encoded serialized bytes ready for storage.
 */
export async function buildDurableNonceTx(
  connection: Connection,
  feePayer: Keypair,
  noncePubkey: PublicKey,
  destination: PublicKey,
  lamports: number
): Promise<{ serializedTx: string; nonce: string; feeLamports: number }> {
  // Get the current nonce value to use as blockhash
  const nonce = await getNonceValue(connection, noncePubkey);

  const tx = new Transaction();

  // NonceAdvance MUST be the first instruction
  tx.add(
    SystemProgram.nonceAdvance({
      noncePubkey,
      authorizedPubkey: feePayer.publicKey,
    })
  );

  tx.add(
    SystemProgram.transfer({
      fromPubkey: feePayer.publicKey,
      toPubkey: destination,
      lamports,
    })
  );

  // Use nonce value instead of recent blockhash
  tx.recentBlockhash = nonce;
  tx.feePayer = feePayer.publicKey;

  // Sign without broadcasting
  tx.sign(feePayer);

  const serializedTx = tx.serialize({ requireAllSignatures: true }).toString("base64");

  // Estimate fee (5000 lamports per signature is standard)
  const feeLamports = 5000;

  return { serializedTx, nonce, feeLamports };
}

// -----------------------------------------------------------
// Broadcast
// -----------------------------------------------------------

/**
 * Broadcast a pre-signed durable nonce transaction.
 * This is what the SMS webhook calls when triggered.
 */
export async function broadcastSignedTx(
  connection: Connection,
  serializedBase64: string
): Promise<string> {
  const buffer = Buffer.from(serializedBase64, "base64");

  const txSignature = await connection.sendRawTransaction(buffer, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  // Wait for confirmation
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    { signature: txSignature, blockhash, lastValidBlockHeight },
    "confirmed"
  );

  return txSignature;
}

// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------

export function lamportsToSol(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toFixed(9).replace(/\.?0+$/, "");
}

export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}
