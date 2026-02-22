#!/usr/bin/env bash
# ============================================================
# Afterself Demo — Executor Mode
# Shows what happens when the switch triggers:
# mortality pool transfer, BTC to trusted wallet, last messages
# Uses a temp directory so nothing touches your real ~/.afterself
# ============================================================

set -euo pipefail

# --- Paths ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SCRIPTS="$PROJECT_DIR/scripts"

# --- Isolated state (temp HOME) ---
DEMO_HOME=$(mktemp -d -t afterself-executor-XXXX)
export HOME="$DEMO_HOME"
export AFTERSELF_VAULT_PASSWORD="afterself-demo-2025"

cleanup() { rm -rf "$DEMO_HOME"; }
trap cleanup EXIT

# --- Colors ---
CYAN='\033[0;36m'
GREEN='\033[0;32m'
GOLD='\033[1;33m'
RED='\033[0;31m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

# --- Helpers ---
agent() {
  echo ""
  echo -e "  ${CYAN}afterself ▸${NC} $1"
}

status() {
  echo -e "  ${DIM}$1${NC}"
}

check() {
  echo -e "  ${GREEN}✓${NC} $1"
}

run_quiet() {
  local label="$1"; shift
  "$@" > /dev/null 2>&1
  status "✓ $label"
}

run_show() {
  "$@" 2>/dev/null | node -e "
    let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      try {
        const r=JSON.parse(d);
        if(r.ok) console.log(JSON.stringify(r.data,null,2));
        else console.log('Error:',r.error);
      } catch(e) { console.log(d); }
    });
  " | while IFS= read -r line; do echo "  $line"; done
}

pause() { sleep "${1:-1.5}"; }

divider() {
  echo ""
  echo -e "  ${DIM}─────────────────────────────────────────────${NC}"
  echo ""
}

msgbox() {
  local label="$1"; local to="$2"; shift 2
  echo -e "  ${DIM}┌─ ${label} ──────────────────────────────────┐${NC}"
  echo -e "  ${DIM}│${NC} ${BOLD}to: ${to}${NC}"
  for line in "$@"; do
    echo -e "  ${DIM}│${NC} ${line}"
  done
  echo -e "  ${DIM}└─────────────────────────────────────────────┘${NC}"
}

type_out() {
  local text="$1"
  local speed="${2:-0.04}"
  printf "  ${DIM}—${NC} "
  sleep 0.3
  for (( i=0; i<${#text}; i++ )); do
    printf "%s" "${text:$i:1}"
    sleep "$speed"
  done
  echo ""
}

# ============================================================
# ACT 0 — SETUP (typing animation)
# ============================================================

# Silent: enable mortality pool + config
node "$SCRIPTS/state.js" config set mortalityPool.enabled true > /dev/null 2>&1

clear
echo ""
echo -e "  ${BOLD}${GOLD}▲ AFTERSELF${NC}"
echo -e "  ${DIM}your agent lives on${NC}"
divider
pause 1

agent "I'm Afterself — a digital legacy agent. I monitor your"
agent "check-ins, execute your final wishes, and optionally"
agent "keep your digital presence alive. Let's set you up."
pause 1.5

# Step 1: Channels
agent "Which channels should I check in on?"
pause 0.6
type_out "WhatsApp and Telegram"
run_quiet "Channels set" node "$SCRIPTS/state.js" config set heartbeat.channels '["whatsapp","telegram"]'
pause 0.5

# Step 2: Interval
agent "How often should I ping you?"
pause 0.6
type_out "Every 72 hours"
run_quiet "Interval set to 72h" node "$SCRIPTS/state.js" config set heartbeat.interval "72h"
pause 0.5

# Step 3: Trusted contacts
agent "Who should I contact to confirm your absence?"
pause 0.6
type_out "My sister Elena and my friend Marcus"
run_quiet "Trusted contacts saved" node "$SCRIPTS/state.js" config set heartbeat.escalationContacts '[{"name":"Elena","channel":"whatsapp","id":"elena-001","phone":"+1555123456"},{"name":"Marcus","channel":"telegram","id":"marcus-001","phone":"+1555987654"}]'
pause 0.5

# Step 4: Action plan
agent "What should happen when the switch triggers?"
pause 0.6
type_out "Send last messages to Elena and Marcus"
type_out "Transfer my BTC to my hardware wallet"
node "$SCRIPTS/vault.js" create '{"name":"Final Wishes","actions":[{"type":"message","channel":"whatsapp","to":"+1555123456","content":"Elena — if you'\''re reading this, I love you more than I ever said. The folder on my desk has everything. You were my anchor.","delay":"0h"},{"type":"message","channel":"telegram","to":"@marcus_dev","content":"Marcus — you were the best co-conspirator. Ship the thing we talked about. The repo is yours now.","delay":"0h"},{"type":"crypto_transfer","asset":"BTC","amount":2.4,"toWallet":"bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh","useEscrow":false,"chain":"bitcoin","delay":"0h"}]}' > /dev/null 2>&1
status "✓ Action plan encrypted and saved to vault"
pause 0.5

# Step 5: Arm
agent "Ready to arm the switch?"
pause 0.6
type_out "Arm it"
node "$SCRIPTS/state.js" arm > /dev/null 2>&1
echo ""
echo -e "  ${BOLD}${GOLD}◆ ARMED${NC}  ${DIM}checking in every 72h on whatsapp, telegram${NC}"
pause 0.8

agent "Afterself is armed. I'll check in every 72 hours. Stay safe."
pause 2

# ============================================================
# ACT 1 — TRIGGER
# ============================================================

divider
echo -e "  ${BOLD}${GOLD}▲ EXECUTOR MODE${NC}"
echo -e "  ${DIM}what happens when the switch triggers${NC}"
divider
pause 1.5

agent "Heartbeat check-in missed. Warning period expired."
agent "Escalation contacted 2 trusted people."
pause 1.5

echo ""
echo -e "  ${DIM}  Elena (whatsapp):  ${NC}${RED}confirmed absent${NC}"
echo -e "  ${DIM}  Marcus (telegram): ${NC}${RED}confirmed absent${NC}"
pause 1

agent "Majority confirmed. Triggering executor."
pause 0.8

echo ""
echo -e "  ${DIM}$ state.js trigger${NC}"
run_show node "$SCRIPTS/state.js" trigger
pause 1

echo ""
echo -e "  ${BOLD}${RED}◆ TRIGGERED${NC}  ${DIM}executing final wishes${NC}"
pause 1.5

# ============================================================
# ACT 2 — $SELF → MORTALITY POOL (immediate, automatic)
# ============================================================

agent "Transferring \$SELF tokens to the mortality pool..."
pause 0.8

# Simulated — mortality.js needs live Solana RPC
echo ""
echo -e "  ${DIM}$ mortality.js transfer-to-pool${NC}"
echo "  {"
echo "    \"success\": true,"
echo "    \"txSignature\": \"4xK9vBr3mN8pQwL2hJ6fT5kR7cYdA1sE9uW0iO3nX7mPq\","
echo "    \"amount\": 42000"
echo "  }"
pause 0.8

check "42,000 \$SELF transferred to mortality pool"
node "$SCRIPTS/state.js" audit mortality "tokens_transferred" '{"amount":42000,"txSignature":"4xK9vBr3mN8pQwL2hJ6fT5kR7cYdA1sE9uW0iO3nX7mPq"}' > /dev/null 2>&1
pause 1

# ============================================================
# ACT 3 — EXECUTE ACTION PLAN
# ============================================================

divider
echo -e "  ${BOLD}${GOLD}FINAL WISHES${NC}"
echo -e "  ${DIM}executing encrypted action plans${NC}"
divider
pause 1

agent "Loading action plans from encrypted vault..."
pause 0.8

echo ""
echo -e "  ${DIM}$ vault.js list${NC}"
run_show node "$SCRIPTS/vault.js" list
pause 1.5

agent "3 actions queued. Executing now."
pause 1

# --- Action 1: Message to Elena ---
divider
echo -e "  ${DIM}action 1/3 · message · delay: 0h${NC}"
pause 0.5

msgbox "whatsapp" "Elena (+1555123456)" \
  "" \
  "Elena — if you're reading this, I love you" \
  "more than I ever said. The folder on my desk" \
  "has everything. You were my anchor." \
  ""
pause 1.5

check "Message delivered to Elena via WhatsApp"
node "$SCRIPTS/state.js" audit executor "action_message" '{"to":"Elena","channel":"whatsapp","success":true}' > /dev/null 2>&1
pause 1

# --- Action 2: Message to Marcus ---
echo ""
echo -e "  ${DIM}action 2/3 · message · delay: 0h${NC}"
pause 0.5

msgbox "telegram" "Marcus (@marcus_dev)" \
  "" \
  "Marcus — you were the best co-conspirator." \
  "Ship the thing we talked about. The repo" \
  "is yours now." \
  ""
pause 1.5

check "Message delivered to Marcus via Telegram"
node "$SCRIPTS/state.js" audit executor "action_message" '{"to":"Marcus","channel":"telegram","success":true}' > /dev/null 2>&1
pause 1

# --- Action 3: BTC Transfer ---
echo ""
echo -e "  ${DIM}action 3/3 · crypto_transfer · delay: 0h${NC}"
pause 0.5

agent "Transferring 2.4 BTC to trusted wallet..."
pause 0.8

echo ""
echo "  {"
echo "    \"asset\": \"BTC\","
echo "    \"amount\": 2.4,"
echo "    \"toWallet\": \"bc1qxy2k...x0wlh\","
echo "    \"chain\": \"bitcoin\","
echo "    \"status\": \"confirmed\""
echo "  }"
pause 1

check "2.4 BTC transferred to trusted wallet"
node "$SCRIPTS/state.js" audit executor "action_crypto_transfer" '{"asset":"BTC","amount":2.4,"success":true}' > /dev/null 2>&1
pause 1.5

# ============================================================
# OUTRO
# ============================================================

divider
agent "All wishes executed. Audit trail saved."
agent "The living inherit. The rest is taken care of."
pause 2

echo ""
echo -e "  ${BOLD}${GOLD}▲ AFTERSELF${NC}"
echo -e "  ${DIM}your self, after.${NC}"
echo ""
pause 3
