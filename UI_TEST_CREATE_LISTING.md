# RentAI — Manual UI Test: Create Listing + AI Price Suggestion

> **Tester:** ___________  **Date:** ___________  **Environment:** localhost / staging  
> **Prereqs:** backend running · frontend running · DB seeded · host account: `user1@example.com / password123`

---

## Setup

- [ ] Open `http://localhost:3001`
- [ ] Log in as `user1@example.com` (host account)
- [ ] Navigate to **Host → Create Listing** (or `http://localhost:3001/host/create`)
- [ ] Open browser DevTools → **Network** tab, filter by `ai` (to watch the price-suggestion API call)

---

## BLOCK 1 — Price is NOT required in early steps

### Step 1 — Images

- [ ] The "Upload Photos" section is visible
- [ ] **Do NOT upload anything yet** — click the next visible section directly (just scroll)
- [ ] ✅ Confirm: no validation error, no blocking modal saying "price required"

### Step 2 — Title & Description

- [ ] Type a title: `Beachfront Villa Kelibia Test`
- [ ] Type a description: `Beautiful villa near the sea, with pool and AC.`
- [ ] ✅ Confirm: no price field visible here, no price prompt

### Step 3 — Category

- [ ] Select **Stays** from the category picker
- [ ] ✅ Confirm: page does not require a price before selecting category

### Step 4 — Location

- [ ] Type address: `Kelibia, Nabeul, Tunisia`
- [ ] Click the map pin / confirm coordinates
- [ ] ✅ Confirm: latitude + longitude fields are populated (used by AI engine)
- [ ] ✅ Confirm: still no price field shown, no blocking

### Step 4b — Accommodation attributes (if visible)

- [ ] Set **Property type** → `Villa`
- [ ] Set **Distance to sea** → `0.3` km
- [ ] ✅ Confirm: still no price required to proceed

---

## BLOCK 2 — Step 5: AI Suggestion Panel

- [ ] Scroll down to **Step 5 — AI Price Suggestion**
- [ ] ✅ Confirm: panel is visible with either:
  - A blue `Get AI Price Suggestion now` button (if canSuggest = true), **or**
  - An amber hint `Complete address and category first…` (if canSuggest = false)
- [ ] If amber hint shown: go back and complete address + category, then return

### Trigger suggestion manually

- [ ] Click **Get AI Price Suggestion now**
- [ ] ✅ Confirm: spinner / "Analysing Kelibia…" text appears immediately
- [ ] ✅ Confirm in DevTools Network: `POST /api/ai/price-suggestion` fires, status = `200`
- [ ] ✅ After response: Step 5 changes to green pill "AI suggestion ready — scroll down to review"

---

## BLOCK 3 — Step 6: Review Panel — AI Card

- [ ] Scroll down to **Step 6 — Review & Publish**
- [ ] ✅ Confirm: **PriceSuggestionCard** is visible at the top of the step (NOT a spinner)

### Card contents to verify

- [ ] **Recommended price** — large number visible (e.g. `380.00 TND/night`)
- [ ] **Range** — `Range 290.0 – 490.0 TND` below the price
- [ ] **Confidence badge** — one of: `✦ High confidence` / `◈ Medium confidence` / `⚠ Low confidence`
- [ ] **Range bar** — horizontal bar with a dot positioned at the recommended price
- [ ] **3 explanation bullets** — exactly 3 items with ✓ icons, each with meaningful text (not empty)
- [ ] **Footer** — shows "Based on N listings · TND" and a `↻ Re-run` button
- [ ] ✅ If confidence = `low` → orange warning shown mentioning comps count

---

## BLOCK 4 — Auto-trigger (scroll test)

- [ ] Reload the page (`F5`) — **do not** click "Get AI Suggestion" in Step 5
- [ ] Fill in Steps 1–4 (title, category Stays, address Kelibia, coordinates)
- [ ] Slowly scroll down past Step 5 toward Step 6
- [ ] ✅ Confirm: `POST /api/ai/price-suggestion` fires **automatically** in DevTools (no button click needed)
- [ ] ✅ Confirm: card shows loading skeleton, then result — all without any manual button press
- [ ] ✅ Confirm: Step 5 pill updates to "AI suggestion ready" after result arrives

---

## BLOCK 5 — Price Input Pre-fill

- [ ] Look at the **"Final price (TND)"** input below the AI card in Step 6
- [ ] ✅ Confirm: input is **pre-filled** with the AI recommended value (e.g. `380`)
- [ ] ✅ Confirm: label shows `— pre-filled from AI suggestion, edit if needed`
- [ ] ✅ Confirm: input is editable (click into it, change value)
- [ ] ✅ Confirm: no `required` HTML attribute (right-click → Inspect → no `required` on the `<input>`)

---

## BLOCK 6 — Manual Override

- [ ] Clear the price input and type: `450`
- [ ] ✅ Confirm: amber override note appears: `✎ You've overridden the AI suggestion (380.00 TND → 450.00 TND)`
- [ ] ✅ Confirm: the **summary table** at the bottom of Step 6 shows `450.00 TND` (not 380)
- [ ] ✅ Confirm: Publish button is **enabled** (not greyed out)

---

## BLOCK 7 — Missing Price Guard

- [ ] Clear the price input completely (leave blank)
- [ ] ✅ Confirm: amber warning appears: `⚠ Price is required to publish…`
- [ ] ✅ Confirm: **Publish Listing** button is **disabled** (greyed out, cursor: not-allowed)
- [ ] ✅ Confirm: hovering over the button shows tooltip `Enter a price to publish`
- [ ] ✅ Confirm: you **cannot** submit the form (button click does nothing)

---

## BLOCK 8 — Publish with Overridden Price

- [ ] Upload at least 1 photo (required by backend)
- [ ] Set price to `450`
- [ ] Click **Publish Listing**
- [ ] ✅ Confirm: spinner shows `Publishing…`
- [ ] ✅ Confirm: success toast appears: `Listing created successfully!`
- [ ] ✅ Confirm: page redirects to `/host/listings`
- [ ] ✅ Confirm: new listing appears in the host dashboard

### Verify final price in DB / API

```powershell
# Get the newest listing (replace $TOKEN):
curl -s "http://localhost:3000/api/listings?hostId=me&limit=1" `
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
```

- [ ] ✅ `pricePerDay` = `450` (the **overridden** value, not the AI-recommended 380)

### Verify price suggestion log was linked

```powershell
curl -s "http://localhost:3000/api/ai/price-suggestion/logs?limit=1" `
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
```

- [ ] ✅ `data[0].finalPrice` = `450`
- [ ] ✅ `data[0].recommended` = `380` (original AI value)
- [ ] ✅ `data[0].overridden` = `true`
- [ ] ✅ `data[0].listingId` = non-null UUID (linked to the new listing)

---

## BLOCK 9 — Error Fallback UI

- [ ] Stop the backend (`Ctrl+C`)
- [ ] Reload the Create Listing page, fill Steps 1–4, scroll to Step 6
- [ ] ✅ Confirm: error state card appears: `AI suggestion unavailable` (red card, not a 500 page)
- [ ] ✅ Confirm: `↻ Try again` button visible in the error card
- [ ] ✅ Confirm: price input is visible and empty (manual entry still possible)
- [ ] ✅ Confirm: amber `⚠ Price is required` warning shown
- [ ] Restart backend, click `↻ Try again`
- [ ] ✅ Confirm: suggestion loads successfully

---

## Pass / Fail Summary

| # | Check | Pass | Fail | Notes |
|---|---|---|---|---|
| B1 | No price required in steps 1–4 | | | |
| B2 | Step 5 trigger button + spinner | | | |
| B3 | Card shows recommended + range + confidence + 3 bullets | | | |
| B4 | Auto-trigger on scroll (IntersectionObserver) | | | |
| B5 | Price input pre-filled from AI recommendation | | | |
| B6 | Override note + summary updates to new price | | | |
| B7 | Blank price disables Publish button | | | |
| B8 | Published listing has `pricePerDay = 450` (overridden) | | | |
| B8b | Log row: `finalPrice=450`, `overridden=true`, `listingId≠null` | | | |
| B9 | Error state card, no 500, retry works | | | |

**All 10 checks must pass before the feature is demo-ready.**

---

*Estimated test time: ~8 minutes per full run.*
