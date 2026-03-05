// ============================================================
// Afterself — Core Types
// ============================================================

/** Supported messaging channels (mirrors OpenClaw channels) */
export type Channel =
  | "whatsapp"
  | "telegram"
  | "discord"
  | "signal"
  | "slack"
  | "imessage"
  | "webchat"
  | "email";

/** Current state of the dead man's switch */
export type SwitchState =
  | "armed"        // Normal — timer running, user alive
  | "warning"      // Missed check-in, warning sent to user
  | "escalating"   // Contacting trusted contacts for confirmation
  | "triggered"    // Confirmed absence — executor running
  | "completed"    // All actions executed
  | "disabled";    // Manually disabled

/** Ghost Mode learning state */
export type GhostState =
  | "off"          // Not enabled
  | "learning"     // Collecting data, building persona
  | "ready"        // Persona built, waiting for trigger
  | "active"       // Responding on behalf of user
  | "fading"       // Time decay — gradually reducing activity
  | "retired";     // Fully deactivated

// -----------------------------------------------------------
// Configuration
// -----------------------------------------------------------

export interface AfterselfConfig {
  heartbeat: HeartbeatConfig;
  vault: VaultConfig;
  executor: ExecutorConfig;
  ghost: GhostConfig;
  llm: LLMConfig;
  mortalityPool: MortalityPoolConfig;
  panic: PanicConfig;
}

export interface HeartbeatConfig {
  /** How often to ping the user (e.g. "72h", "48h", "7d") */
  interval: string;
  /** Channels to send check-in pings on */
  channels: Channel[];
  /** Grace period after first missed check-in */
  warningPeriod: string;
  /** Time to wait for trusted contact response */
  escalationTimeout: string;
  /** People to confirm absence */
  escalationContacts: TrustedContact[];
}

export interface TrustedContact {
  name: string;
  phone?: string;
  email?: string;
  channel: Channel;
  /** Unique identifier for this contact */
  id: string;
}

export interface VaultConfig {
  /** Encryption algorithm */
  encryption: "aes-256-gcm";
  /** Enable double-layer encryption with beneficiary public key */
  beneficiaryKeyEnabled: boolean;
  /** Path to local encrypted database */
  dbPath: string;
  /** Optional backup path */
  backupPath?: string;
}

export interface ExecutorConfig {
  enabled: boolean;
  /** Require trusted contact confirmation before executing */
  confirmationGate: boolean;
  /** Log all actions for beneficiary review */
  auditLog: boolean;
  /** Max retries for failed actions */
  maxRetries: number;
  /** Delay between actions (ms) to avoid rate limiting */
  actionDelay: number;
}

export interface GhostConfig {
  enabled: boolean;
  /** Actively collecting persona data */
  learning: boolean;
  /** Label all messages as AI-generated */
  transparency: boolean;
  /** Enable voice responses via ElevenLabs */
  voiceEnabled: boolean;
  /** ElevenLabs voice ID (created during setup) */
  voiceId?: string;
  /** Auto-post on social media */
  socialPosting: boolean;
  /** Gradual activity reduction */
  timeDecay: {
    enabled: boolean;
    /** Days over which to fade (e.g. 90) */
    fadeOverDays: number;
  };
  /** Contacts who can deactivate ghost mode */
  killSwitchContacts: string[];
  /** Topics/subjects to never discuss */
  blockedTopics: string[];
}

export interface LLMConfig {
  /** Provider: anthropic, openai, ollama */
  provider: "anthropic" | "openai" | "ollama";
  /** Model name */
  model: string;
  /** API key (stored encrypted) */
  apiKey?: string;
  /** Ollama base URL if using local */
  baseUrl?: string;
  /** Max tokens per response */
  maxTokens: number;
  /** Temperature for ghost responses */
  temperature: number;
}

export interface MortalityPoolConfig {
  enabled: boolean;
  /** The shared pool wallet all tokens go to on death */
  poolWallet: string;
  /** SPL token mint address */
  tokenMint: string;
  /** Path to user's Solana keypair JSON file */
  keypairPath?: string;
  /** Solana RPC endpoint (default: mainnet-beta) */
  rpcUrl: string;
  /** Nudge user to buy token if balance is 0 */
  nudgeEnabled: boolean;
}

// -----------------------------------------------------------
// Panic Button
// -----------------------------------------------------------

export interface PanicAction {
  /** Human-readable label (e.g. "wife", "brother", "burn") */
  label: string;
  /** SHA-256 hash of the secret emergency code */
  codeHash: string;
  /** Destination Solana wallet address (or burn address) */
  destination: string;
  /** Asset type */
  asset: "sol";
  /** When this action was configured */
  createdAt: string;
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
}

// -----------------------------------------------------------
// Vault / Action Plans
// -----------------------------------------------------------

export interface ActionPlan {
  id: string;
  /** Human-readable name */
  name: string;
  /** Actions to execute in order */
  actions: Action[];
  /** When this plan was created */
  createdAt: string;
  /** When this plan was last updated */
  updatedAt: string;
}

export type Action =
  | MessageAction
  | EmailAction
  | CryptoTransferAction
  | CloseAccountAction
  | SocialPostAction
  | CustomAction;

export interface MessageAction {
  type: "message";
  channel: Channel;
  to: string;
  content: string;
  attachments?: string[];
  /** Delay before sending (e.g. "0h", "24h", "7d") */
  delay: string;
}

export interface EmailAction {
  type: "email";
  to: string;
  subject: string;
  body: string;
  attachments?: string[];
  delay: string;
}

export interface CryptoTransferAction {
  type: "crypto_transfer";
  asset: string;
  amount: number;
  toWallet: string;
  /** Use escrow for trustless transfer */
  useEscrow: boolean;
  /** Chain: ethereum, solana, bitcoin, etc. */
  chain: string;
  delay: string;
}

export interface CloseAccountAction {
  type: "close_account";
  service: string;
  /** URL to navigate to */
  url: string;
  /** Method: browser_automation | api | email_request */
  method: "browser_automation" | "api" | "email_request";
  /** Additional instructions for browser automation */
  instructions?: string;
  delay: string;
}

export interface SocialPostAction {
  type: "social_post";
  platform: "twitter" | "instagram" | "facebook" | "linkedin";
  content: string;
  /** Image/video attachments */
  media?: string[];
  delay: string;
}

export interface CustomAction {
  type: "custom";
  /** Description of what to do */
  description: string;
  /** Webhook URL to call */
  webhookUrl?: string;
  /** Webhook payload */
  webhookPayload?: Record<string, unknown>;
  delay: string;
}

// -----------------------------------------------------------
// Ghost / Persona
// -----------------------------------------------------------

export interface PersonaProfile {
  /** Display name */
  name: string;
  /** Writing style descriptors */
  writingStyle: {
    formality: "casual" | "mixed" | "formal";
    averageMessageLength: "short" | "medium" | "long";
    usesEmoji: boolean;
    commonEmojis: string[];
    commonPhrases: string[];
    humor: "dry" | "playful" | "sarcastic" | "warm" | "none";
    punctuationStyle: string;
  };
  /** Topics the person frequently discusses */
  knownTopics: string[];
  /** Topics to never generate responses about */
  blockedTopics: string[];
  /** Sample messages for few-shot prompting */
  sampleMessages: SampleMessage[];
  /** Voice profile ID (ElevenLabs) */
  voiceId?: string;
  /** When persona was last updated */
  lastUpdated: string;
  /** Number of messages analyzed */
  messagesAnalyzed: number;
}

export interface SampleMessage {
  /** The context/prompt that preceded this message */
  context?: string;
  /** The actual message from the person */
  message: string;
  /** Channel it came from */
  channel: Channel;
  /** Timestamp */
  timestamp: string;
}

// -----------------------------------------------------------
// State / Persistence
// -----------------------------------------------------------

export interface AfterselfState {
  switchState: SwitchState;
  ghostState: GhostState;
  /** Timestamp of last successful check-in */
  lastCheckIn: string | null;
  /** Timestamp of last heartbeat ping sent */
  lastPingSent: string | null;
  /** Number of consecutive missed check-ins */
  missedCheckIns: number;
  /** Escalation responses received */
  escalationResponses: EscalationResponse[];
  /** Executor progress */
  executorProgress: {
    totalActions: number;
    completedActions: number;
    failedActions: string[];
    currentAction?: string;
  };
  /** Ghost activation timestamp */
  ghostActivatedAt: string | null;
  /** Mortality pool token balance (last checked) */
  mortalityTokenBalance: number | null;
  /** Whether tokens were transferred to pool on trigger */
  mortalityTransferComplete: boolean;
}

export interface EscalationResponse {
  contactId: string;
  response: "confirmed_absent" | "confirmed_alive" | "no_response";
  timestamp: string;
}

// -----------------------------------------------------------
// Audit Log
// -----------------------------------------------------------

export interface AuditEntry {
  id: string;
  timestamp: string;
  type: "heartbeat" | "escalation" | "executor" | "ghost" | "config" | "mortality" | "panic" | "error";
  action: string;
  details: Record<string, unknown>;
  success: boolean;
}
