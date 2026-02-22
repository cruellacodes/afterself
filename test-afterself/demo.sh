#!/usr/bin/env bash
# ============================================================
# Afterself Demo — Screen Recording Script
# Runs the setup flow + ghost mode demo in ~60 seconds
# Uses a temp directory so nothing touches your real ~/.afterself
# ============================================================

set -euo pipefail

# --- Paths ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SCRIPTS="$PROJECT_DIR/scripts"

# --- Isolated state (temp HOME) ---
DEMO_HOME=$(mktemp -d -t afterself-demo-XXXX)
export HOME="$DEMO_HOME"
export AFTERSELF_VAULT_PASSWORD="afterself-demo-2025"

cleanup() { rm -rf "$DEMO_HOME"; }
trap cleanup EXIT

# --- Colors ---
CYAN='\033[0;36m'
GREEN='\033[0;32m'
GOLD='\033[1;33m'
DIM='\033[2m'
BOLD='\033[1m'
ITALIC='\033[3m'
NC='\033[0m'

# --- Helpers ---
agent() {
  echo ""
  echo -e "  ${CYAN}afterself ▸${NC} $1"
}

user() {
  echo ""
  echo -e "  ${GREEN}you ▸${NC} $1"
}

status() {
  echo -e "  ${DIM}$1${NC}"
}

run_quiet() {
  # Run a script, suppress output, print a short confirmation
  local label="$1"; shift
  "$@" > /dev/null 2>&1
  status "✓ $label"
}

run_show() {
  # Run a script and show its JSON output (trimmed)
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

# ============================================================
# ACT 1 — SETUP FLOW
# ============================================================

clear
echo ""
echo -e "  ${BOLD}${GOLD}▲ AFTERSELF DEMO${NC}"
echo -e "  ${DIM}your agent lives on${NC}"
divider
pause 2

user "Set up Afterself"
pause 1.5

agent "Afterself is a digital legacy agent. It monitors your check-ins,"
agent "executes your final wishes if you're gone, and optionally"
agent "keeps your digital presence alive with Ghost Mode."
pause 2

agent "Let's walk through the setup."
pause 1.5

# Step 1: Channels
divider
agent "Which channels should I check in on?"
pause 1

user "WhatsApp and Telegram"
pause 0.8

run_quiet "Channels set" node "$SCRIPTS/state.js" config set heartbeat.channels '["whatsapp","telegram"]'
pause 1

# Step 2: Interval
agent "How often should I ping you? Default is every 72 hours."
pause 1

user "72 hours is fine"
pause 0.8

run_quiet "Interval set to 72h" node "$SCRIPTS/state.js" config set heartbeat.interval "72h"
run_quiet "Warning period set to 24h" node "$SCRIPTS/state.js" config set heartbeat.warningPeriod "24h"
pause 1

# Step 3: Trusted contacts
agent "Who should I contact to confirm your absence?"
pause 1

user "My sister Elena and my friend Marcus"
pause 0.8

run_quiet "Trusted contacts saved" node "$SCRIPTS/state.js" config set heartbeat.escalationContacts '[{"name":"Elena","channel":"whatsapp","id":"elena-001","phone":"+1555123456"},{"name":"Marcus","channel":"telegram","id":"marcus-001","phone":"+1555987654"}]'
pause 1

# Step 4: Action plan
agent "What should happen when the switch triggers?"
pause 1

user "Send a message to Elena on WhatsApp, and post a final tweet"
pause 0.8

run_quiet "Action plan encrypted and saved to vault" node "$SCRIPTS/vault.js" create '{"name":"Final Wishes","actions":[{"type":"message","channel":"whatsapp","to":"+1555123456","content":"Hey Elena. If you'\''re reading this, I love you. Everything you need is in the folder on my desk.","delay":"0h"},{"type":"social_post","platform":"twitter","content":"If you'\''re seeing this, I'\''m no longer here. Thank you for everything. Take care of each other.","delay":"24h"}]}'
pause 1.5

# Step 5: Arm
agent "Ready to arm the switch?"
pause 1

user "Arm it"
pause 0.8

run_quiet "Switch armed" node "$SCRIPTS/state.js" arm
echo ""
echo -e "  ${BOLD}${GOLD}◆ ARMED${NC}  ${DIM}checking in every 72h on whatsapp, telegram${NC}"
pause 1

agent "Afterself is armed. I'll check in every 72 hours. Stay safe."
pause 2.5

# ============================================================
# ACT 2 — GHOST MODE
# ============================================================

divider
echo -e "  ${BOLD}${GOLD}👻 GHOST MODE${NC}"
echo -e "  ${DIM}preserving your digital presence${NC}"
divider
pause 2

agent "Analyzing your message history to build a persona profile..."
pause 1

echo ""
echo -e "  ${DIM}$ persona.js analyze --input messages.json${NC}"
echo ""
run_show node "$SCRIPTS/persona.js" analyze --input "$SCRIPT_DIR/messages.json"
pause 3

agent "Persona profile built. Let me show you how Ghost Mode responds."
pause 2

# Simulate incoming message
divider
echo -e "  ${DIM}┌─ incoming message ──────────────────────────┐${NC}"
echo -e "  ${DIM}│${NC} ${BOLD}[WhatsApp] Marcus:${NC}                          ${DIM}│${NC}"
echo -e "  ${DIM}│${NC} hey, you around? wanted to talk about that   ${DIM}│${NC}"
echo -e "  ${DIM}│${NC} solana project we discussed                  ${DIM}│${NC}"
echo -e "  ${DIM}└─────────────────────────────────────────────┘${NC}"
pause 2

status "Retrieving relevant persona samples..."
pause 0.5
echo ""
echo -e "  ${DIM}$ persona.js retrieve --query \"solana project\"${NC}"
echo ""
run_show node "$SCRIPTS/persona.js" retrieve --query "solana project" --limit 3
pause 2

status "Generating response in learned voice..."
pause 1.5

# Ghost response (pre-written to match persona style)
echo ""
echo -e "  ${DIM}┌─ ghost response ────────────────────────────┐${NC}"
echo -e "  ${DIM}│${NC}                                              ${DIM}│${NC}"
echo -e "  ${DIM}│${NC}  🕯️ hey marcus! yeah the solana thing has     ${DIM}│${NC}"
echo -e "  ${DIM}│${NC}  been on my mind tbh. the architecture is     ${DIM}│${NC}"
echo -e "  ${DIM}│${NC}  really clean — were you thinking about the   ${DIM}│${NC}"
echo -e "  ${DIM}│${NC}  token integration or the agent layer?        ${DIM}│${NC}"
echo -e "  ${DIM}│${NC}                                              ${DIM}│${NC}"
echo -e "  ${DIM}└─────────────────────────────────────────────┘${NC}"
pause 2.5

agent "Every Ghost Mode response is prefixed with 🕯️ for transparency."
agent "Ghost fades over 90 days. Anyone can say \"stop\" to deactivate instantly."
pause 2.5

# Outro
divider
echo ""
echo -e "  ${BOLD}${GOLD}▲ AFTERSELF${NC}"
echo -e "  ${DIM}your self, after.${NC}"
echo ""
pause 3
