// ============================================================
// afterself-panic — Types
// ============================================================

export interface PanicAction {
  /** Human-readable label (e.g. "wife", "brother", "burn") */
  label: string;
  /** SHA-256 hash of the secret emergency code (for SMS auth) */
  codeHash: string;
  /** Base64-encoded serialized pre-signed durable nonce transaction */
  signedTx: string;
  /** Nonce account pubkey used in this transaction */
  nonceAccount: string;
  /** Destination Solana wallet address — for display only */
  destination: string;
  /** Amount in lamports — for display only */
  amountLamports: number;
  /** Asset type */
  asset: "sol";
  /** When this action was configured */
  createdAt: string;
  /** Action mode: wallet = send to user's address, cash = send to escrow for WU pickup */
  mode?: "wallet" | "cash";
  /** Cash mode: full name of the Western Union recipient */
  cashReceiverName?: string;
  /** Cash mode: country for WU pickup (e.g. "Greece") */
  cashCountry?: string;
  /** Cash mode: currency for WU pickup (e.g. "EUR") */
  cashCurrency?: string;
}

export interface PanicConfig {
  enabled: boolean;
  /** Emergency actions mapped to hashed codes (max 5) */
  actions: PanicAction[];
  /** SHA-256 hash of registered phone number (for SMS verification) */
  phoneHash?: string;
  /** Seconds between allowed attempts (rate limiting) */
  cooldownSeconds: number;
  /** Timestamp of last verify attempt */
  lastAttempt?: string;
  /** Solana RPC endpoint */
  rpcUrl: string;
  /** Path to Solana keypair JSON file */
  keypairPath?: string;
  /** Hosted service URL (e.g. https://afterself-panic.onrender.com) */
  apiUrl?: string;
  /** Auth token from /api/register — stored locally, never sent to anyone else */
  userToken?: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  type: "panic" | "error";
  action: string;
  details: Record<string, unknown>;
  success: boolean;
}
