# RentAI — Day 7 Rehearsal Runbook

**Goal:** Run 3 back-to-back rehearsals with a clean reset between each.  
**Total time budget:** ~25 min (8 min demo + 2 min reset/review × 3)

---

## Before Any Rehearsal

```bash
cd all-the-project-
docker-compose up -d postgres          # confirm DB is running
npm run dev:all                         # backend :3001 + frontend :3000
```

- [ ] `http://localhost:3000/api/health` → `{"success":true}`
- [ ] `http://localhost:3000/demo/categories` loads
- [ ] `http://localhost:3000/demo/ai-search` loads
- [ ] `http://localhost:3000/api/docs` loads (Swagger)

Keep three browser tabs open in this order: **Categories → AI Search → Swagger**

---

## Rehearsal 1 — Full Speed, No Stops

> Goal: complete the whole flow once without pausing. Identify hesitations.

### Reset
```bash
npm run seed:demo
```
- [ ] Seed completes, note **SLOT_DATE** printed in summary

### Run the flow (follow DEMO_SCRIPT.md)

| Step | What to confirm | ✓ |
|---|---|---|
| 1 | Kelibia: 5 cats at 10 km | ☐ |
| 2 | Tunis: different cats | ☐ |
| 3 | 5 km → fewer cats, 50 km → more | ☐ |
| 4 | "villa near beach under 300" → RESULT + chips | ☐ |
| 5 | Manual query → FOLLOW_UP appears OR goes to RESULT | ☐ |
| 6 | Max 1 follow-up: mode stays RESULT on second call | ☐ |
| 7 | Swagger: `POST /api/bookings` (DAILY) → **409** | ☐ |
| 8 | Swagger: SLOT 10:00 absent + `POST` → **409** | ☐ |

### After Rehearsal 1 — Note
- [ ] Which step caused a hesitation?
- [ ] Was FOLLOW_UP triggered? (circle: YES / NO)
- [ ] Any console errors? ________________________
- [ ] Time taken: _______ min

---

## Rehearsal 2 — Narration Focus

> Goal: practise the narration while clicking. Each step has 1–2 sentences. No silence longer than 3 s.

### Reset
```bash
npm run seed:demo
```
- [ ] Seed completes

### Run the flow with narration

| Step | Narration cue | ✓ |
|---|---|---|
| 1–2 | *"Categories are derived from live listings. Watch them change when I switch city."* | ☐ |
| 3 | *"Tighten the radius — fewer categories. Open it — more appear."* | ☐ |
| 4 | *"Natural language goes in, structured filters come out."* | ☐ |
| 5–6 | *"Ambiguous query → one clarifying question. Only one — we prevent infinite loops."* | ☐ |
| 7 | *"Booking the same dates → 409 Conflict. Enforced at the DB level."* | ☐ |
| 8 | *"10:00 slot is gone from the list. Trying to book it → 409."* | ☐ |

### After Rehearsal 2 — Note
- [ ] Any sentence that felt awkward? ________________________
- [ ] Did FOLLOW_UP trigger this time? (circle: YES / NO)
- [ ] Time taken: _______ min  (target: ≤ 8 min)

---

## Rehearsal 3 — Adversarial Run

> Goal: simulate a failure and recover cleanly. Do not skip this.

### Reset
```bash
npm run seed:demo
```
- [ ] Seed completes

### Run the flow, then deliberately trigger edge cases

| Scenario | How to trigger | Expected recovery |
|---|---|---|
| AI returns error → error banner | Temporarily kill network OR disconnect VPN | Click Retry, reconnect, re-search |
| No categories appear | Click Tunis → 50 km (extreme radius) | Switch back to Kelibia + 10 km |
| AI goes straight to RESULT (no FOLLOW_UP) | Use "football pitch tonight" | Say *"AI is confident — no follow-up needed"* and continue |
| Swagger Authorize expired | 401 on booking call | Re-login, copy new token, re-Authorize |
| Port 3000 already in use | Check if a previous run is open | `npx kill-port 3000 && npm run dev:all` |

### After Rehearsal 3 — Note
- [ ] Were you able to recover from each failure calmly?
- [ ] Time taken including one recovery: _______ min

---

## Quick Fixes Reference

| Symptom | Fix |
|---|---|
| Categories list empty | Check backend is on :3001 · `npm run dev:all` |
| AI search hangs | Check `OPENAI_API_KEY` in `.env` · fallback still returns results |
| Seed fails: FK constraint | `npx prisma migrate reset --force` then `npm run seed:demo` |
| DB not reachable | `docker-compose up -d postgres` · wait 5 s |
| PostGIS error | `psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS postgis;"` |
| 401 on Swagger | Re-`POST /auth/login`, copy fresh `accessToken`, re-Authorize |
| 409 not appearing | Confirm seed completed · use fixed UUID `b1000001-…` |
| Frontend blank page | `next dev` crashed · check terminal · restart with `npm run dev:all` |
| FOLLOW_UP never fires | Backend using keyword fallback (no OpenAI key) — mention it as a graceful fallback |

---

## Day 7 Sign-Off

- [ ] Rehearsal 1 complete
- [ ] Rehearsal 2 complete (narration smooth)
- [ ] Rehearsal 3 complete (recovered from ≥ 1 failure)
- [ ] Total demo flow ≤ 8 min confirmed
- [ ] Browser tabs pre-ordered: Categories → AI Search → Swagger
- [ ] Projector / screen-share resolution confirmed (1080p)
- [ ] Presenter water bottle on desk 💧

**Ready to demo. 🟢**
