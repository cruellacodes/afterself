# Afterself — Your Agent Lives On

> *"Your self, after. It doesn't just execute your will — it preserves your voice."*

An OpenClaw skill that activates when you can't. Two modes:

- **Executor Mode** — Handles your affairs: transfers assets, sends final messages, cancels accounts
- **Ghost Mode** — Preserves your digital presence: responds in your voice, maintains your social presence

Built on [OpenClaw](https://github.com/openclaw/openclaw). Local-first. Encrypted. Open source.

---

## Install

```bash
# Install from npm
npm install afterself

# Or clone and install locally
git clone https://github.com/cruellacodes/afterself
cd afterself
npm install && npm run build
```

## Setup

Once installed, just tell your OpenClaw agent:

> "Set up Afterself"

The agent walks you through everything:
1. Which channels to monitor (WhatsApp, Telegram, Discord, etc.)
2. How often to check in (default: every 72 hours)
3. Who your trusted contacts are
4. What should happen when the switch triggers (messages, emails, account closures)
5. Whether to enable Ghost Mode (AI continues responding in your voice)

---

## How It Works

### 1. Heartbeat (Dead Man's Switch)

```
You <── WhatsApp/Telegram/Discord <── Afterself
         "Hey, check in please"

You -> Reply -> Timer resets (nothing happens)
You -> No reply for 72h -> Escalation begins
```

**Escalation flow:**
1. Afterself pings you on all configured channels
2. No response after warning period -> contacts your trusted people
3. Trusted contacts confirm your absence -> **Executor activates**

### 2. Executor Mode

Reads your encrypted vault and executes your action plan:
- Send final messages on WhatsApp, Telegram, Discord, Signal, etc.
- Send emails with attachments
- Post farewell messages on social media
- Close online accounts via browser automation
- Transfer crypto assets via escrow
- Call custom webhooks

### 3. Ghost Mode

**Learning (while you're alive):**
- Analyzes your message history to build a persona profile
- Captures writing style, humor, emoji usage, topics, common phrases

**Active (after trigger):**
- Responds to messages in your voice using your persona profile
- Every response grounded in RAG retrieval from your real messages
- Every message labeled as AI-generated (transparency)
- Kill switch — designated people can shut it down instantly
- Time decay — gradually reduces activity over weeks/months

---

## Architecture

```
afterself/
├── SKILL.md                        # OpenClaw skill definition
├── HEARTBEAT.md                    # Periodic dead man's switch monitor
├── ETHICS.md                       # Ethics framework
├── scripts/
│   ├── types.ts                    # TypeScript type definitions
│   ├── state.ts                    # State management CLI
│   ├── vault.ts                    # Encrypted vault CLI
│   └── persona.ts                  # Persona analysis CLI
├── references/
│   ├── escalation-protocol.md      # Escalation message templates
│   ├── ghost-persona-prompt.md     # Ghost mode prompt template
│   └── action-schema.md            # Action plan JSON schema
└── index.html                      # Landing page
```

---

## Ethics & Safety

Read the full ethics document: [ETHICS.md](ETHICS.md)

**Core principles:**
1. **Consent-first** — You must explicitly opt in while alive
2. **Transparency** — Every AI interaction is clearly labeled
3. **Local-first** — Your data never leaves your device
4. **Kill switch** — Designated people can always shut it down
5. **No exploitation** — Ghost Mode has no financial capabilities
6. **Dignity** — Won't hallucinate opinions you never held
7. **Fade gracefully** — Optional time decay

---

## License

MIT — because your digital legacy should be free.

---

*"Your self, after. Nothing left unsaid."*
