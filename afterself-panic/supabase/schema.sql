-- ============================================================
-- afterself-panic — Supabase Schema
-- Run this in your Supabase project's SQL editor.
-- ============================================================

-- Users: one row per registered phone number (hash only, never plaintext)
create table if not exists panic_users (
  id uuid primary key default gen_random_uuid(),
  phone_hash text unique not null,
  token text unique not null default gen_random_uuid()::text,
  last_attempt timestamptz,
  created_at timestamptz default now()
);

-- Actions: pre-signed durable nonce transactions per user
create table if not exists panic_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references panic_users(id) on delete cascade,
  label text not null,
  code_hash text not null,       -- SHA-256 of emergency code (never plaintext)
  signed_tx text not null,       -- base64 pre-signed durable nonce transaction
  nonce_account text not null,   -- Solana nonce account pubkey
  destination text not null,     -- destination wallet (display only)
  amount_lamports bigint not null,
  asset text not null default 'sol',
  rpc_url text not null,         -- RPC to use when broadcasting
  mode text not null default 'wallet',  -- 'wallet' | 'cash'
  cash_receiver_name text,       -- cash mode: WU recipient full name
  cash_country text,             -- cash mode: pickup country (e.g. "Greece")
  cash_currency text,            -- cash mode: pickup currency (e.g. "EUR")
  created_at timestamptz default now(),
  unique(user_id, label),
  unique(user_id, code_hash)
);

-- Audit log: append-only record of all activity
create table if not exists panic_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references panic_users(id),
  action text not null,          -- 'registered','uploaded','executed','failed','rate_limited'
  details jsonb not null default '{}',
  success boolean not null,
  created_at timestamptz default now()
);

-- Indexes for fast SMS lookup
create index if not exists panic_users_phone_hash_idx on panic_users(phone_hash);
create index if not exists panic_actions_user_code_idx on panic_actions(user_id, code_hash);
create index if not exists panic_audit_user_idx on panic_audit(user_id, created_at desc);
