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
cd "/Users/stu/Downloads/Sous App/Sous"
python3 -m http.server 8732