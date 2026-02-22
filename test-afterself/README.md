# Afterself Demo

Automated ~60-second demo scripts for screen recording. Two demos available: setup flow + ghost mode, and executor mode.

## Prerequisites

- Node.js >= 20
- Build the project first:
  ```bash
  cd .. && npm run build
  ```

## Run

```bash
# Setup flow + Ghost Mode
bash demo.sh

# Executor Mode (trigger → mortality pool → messages → BTC → tweet)
bash demo-executor.sh
```

No interaction needed — fully automated. Uses a temp directory for all state, cleans up on exit.

## Recording

**Terminal setup:**
- Size: 100 columns x 30 rows minimum
- Background: black or very dark
- Font: 16–18pt monospace (SF Mono, JetBrains Mono, Menlo)

**OBS (free):**
- Window Capture on the terminal
- Output: 1920x1080, 30fps
- No editing needed

**Alternative — asciinema:**
```bash
asciinema rec demo.cast -c "bash demo.sh"
```

## What they show

**`demo.sh`** — Setup + Ghost Mode
1. Setup flow — configuring channels, interval, trusted contacts, action plan, arming
2. Ghost Mode — persona analysis on sample messages, ghost response with 🕯️ label

**`demo-executor.sh`** — Executor Mode
1. Switch triggers after escalation confirms absence
2. $SELF tokens transferred to mortality pool
3. Action plan executes: last messages to friends, BTC to trusted wallet, final tweet scheduled
4. Full audit trail displayed

## Customizing

- Edit `messages.json` to change the persona voice
- Adjust `sleep` values in either script to change pacing
- Edit message content and action plan details in `demo-executor.sh`
