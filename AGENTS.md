# Sous — AGENTS.md

Sous is a cooking-first nutrition tracking app focused on reducing friction during meal logging.

The goal is NOT:
- calorie counting spreadsheets
- bodybuilding complexity
- generic macro tracking

The goal IS:
- frictionless cooking-time tracking
- conversational interaction
- passive nutrition capture
- meal memory
- fast correction/editing
- high retention through reduced effort

---

# Core Product Thesis

Sous transforms nutrition tracking from a manual logging task into an ambient cooking workflow.

Everything should strengthen this loop:

Cook → speak naturally → live macros update → meal remembered automatically → reused later with minimal effort.

Before adding features, ask:
- Does this reduce friction?
- Does this improve cooking flow?
- Does this improve retention?
- Does this improve trust?

If not, avoid adding it.

---

# Current Priorities

Current focus order:

1. Cooking-session UX
2. Voice workflow reliability
3. Meal memory/repeat meals
4. Fast correction flows
5. Manual + ingredient flow
6. Current meal edit/delete
7. History usability
8. Retention/usability testing

Do NOT proactively build:
- hardware
- social features
- AI coaching
- workout systems
- gamification
- cloud sync
- subscriptions/paywalls
- wearable integrations

unless explicitly requested.

---

# Running the app

```bash
cd "/Users/stu/Documents/Sous App"
npm start
```

The Node server serves both the frontend and the API proxy at `http://localhost:3001`.
For local API-backed testing, create an uncommitted `.env` file based on `.env.example`:

```bash
OPENAI_API_KEY=...
```

Useful checks:

```bash
npm run check:api
npm run check:api:openai
```

Phone-first testing workflow:
- While the laptop is awake, run `npm start` and expose `http://localhost:3001` through a temporary HTTPS tunnel such as Cloudflare Tunnel, then open that tunnel URL on the phone.
- For laptop-asleep testing, use Codex Cloud against GitHub, deploy to the staging branch/site, and test the GitHub Pages URL on the phone against the Render API.
