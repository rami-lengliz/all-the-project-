# RAG Integration in RentAI — Complete Technical Reference

> **Audience:** Any developer/AI assistant joining this project with zero prior context.
> This document explains exactly where, how, and why RAG (Retrieval-Augmented Generation)
> is integrated into this codebase. Every claim is backed by a specific file and line number.

---

## 1. What This Project Is (30-second context)

**RentAI** is a Tunisian rental marketplace backend built with:
- **NestJS** (Node.js framework) — API server on port 3001
- **PostgreSQL + PostGIS** — database with geospatial extension
- **Prisma ORM** — database client
- **Google Gemini / OpenAI** — switchable AI providers

The project has **two AI-powered features**, both using the RAG pattern:
1. **AI Search** — parses a natural-language query into structured search filters
2. **AI Price Suggestion** — suggests a rental price backed by real comparable listings

---

## 2. What RAG Means in This Project

Classical RAG uses **vector embeddings** to retrieve similar documents.
**This project does NOT use vectors or a vector database.**

Instead it uses a **SQL-based retrieval** pattern:

```
┌─────────────────────────────────────────────────────────────┐
│  Classic RAG:  query → embed → vector search → LLM         │
│  RentAI RAG:   query → PostGIS SQL → score → inject → LLM  │
└─────────────────────────────────────────────────────────────┘
```

The three RAG steps in this project:
| Step | Name | Implementation |
|------|------|---------------|
| R | **Retrieve** | PostGIS `ST_DWithin` SQL query fetches real listings/categories from PostgreSQL |
| A | **Augment** | Retrieved data is serialized into the prompt string before calling the AI |
| G | **Generate** | Gemini (or OpenAI) generates the final response using the injected data as context |

---

## 3. The AI Provider System

### 3.1 Provider Interface
**File:** `src/modules/ai/providers/ai-provider.interface.ts`

All providers implement the same interface:
```typescript
interface AiProvider {
  info: AiProviderInfo;                        // name, model, isAvailable
  generateCompletion(prompt: string, options?: CompletionOptions): Promise<string>;
}
```

### 3.2 Gemini Provider
**File:** `src/modules/ai/providers/gemini.provider.ts`

- Uses the **`@google/genai`** npm package (Google's official SDK)
- Reads `GEMINI_API_KEY` and `GEMINI_MODEL` from env (defaults to `gemini-2.0-flash`)
- Calls `client.models.generateContent({ model, contents: prompt, config: { systemInstruction, temperature, maxOutputTokens } })`
- Has a **15-second hard timeout** to prevent hanging the search pipeline
- If `GEMINI_API_KEY` is not set → `isAvailable = false` and feature gracefully degrades

```typescript
// gemini.provider.ts — line 101
const response = await this.client!.models.generateContent({
  model: this.model,                    // e.g. "gemini-2.0-flash"
  contents: prompt,                     // the augmented prompt (with retrieved data)
  config: {
    systemInstruction: systemPrompt,    // role/rules for the model
    temperature: 0.3,
    maxOutputTokens: 800,
  },
});
```

### 3.3 Provider Switcher
**File:** `src/modules/ai/ai.service.ts` — lines 57–79

At startup, reads `AI_PROVIDER` env var and routes ALL completions through one provider:

```typescript
switch (providerName) {           // AI_PROVIDER = 'gemini' | 'openai'
  case 'gemini':
    this.activeProvider = this.geminiProvider;  // → GeminiProvider
    break;
  case 'openai':
    this.activeProvider = this.openAiProvider;  // → OpenAiProvider
    break;
}
```

Both features (Search + Price Suggestion) call `this.aiService.generateCompletion(prompt, options)`,
which is transparently routed to whichever provider is active. **The feature code does not know
or care which AI provider is being used.**

---

## 4. Feature 1: AI Search (RAG for query parsing)

**Entry point:** `POST /api/ai/search`
**Service:** `src/modules/ai/ai-search.service.ts`
**DTO:** `src/modules/ai/dto/ai-search.dto.ts`

### 4.1 What it does

A user sends a natural-language search query like:
> *"villa près de la mer à Kelibia pour 4 personnes"*

The system must convert this to structured filters:
```json
{ "categorySlug": "stays", "q": "villa", "radiusKm": 10, "sortBy": "distance" }
```

### 4.2 The RAG Flow — Search

```
Step R (Retrieve):
  Input: user lat/lng + radiusKm
  SQL: SELECT slug FROM categories
       WHERE ST_DWithin(listings.location, user_point, radiusKm)
       AND listings.is_active = true
  Output: ["stays", "sports-facilities", "beach-gear"]   ← real slugs from DB

Step A (Augment):
  This list is injected into the system prompt sent to Gemini:
  "Available categories: stays, sports-facilities, beach-gear"
  ← Gemini CANNOT invent a category — it must pick from this list

Step G (Generate):
  Gemini receives the augmented prompt and returns structured JSON.
  The JSON is validated with Zod (AiResponseSchema).
  Invalid/hallucinated categorySlug values are silently discarded.
```

### 4.3 Retrieve — Nearby Categories
**File:** `src/modules/ai/ai-search.service.ts` — lines 50–59

```typescript
// Retrieves the actual categories that have listings near the user
const nearbyCategories = await this.categoriesService.findNearbyWithCounts(
  dto.lat, dto.lng,
  dto.radiusKm || 10,
  false,  // only include categories with at least 1 listing
);
availableSlugs = nearbyCategories.map((c) => c.slug);
// → e.g. ["stays", "sports-facilities", "beach-gear"]
```

**File:** `src/modules/categories/categories.service.ts`
Uses PostGIS `ST_DWithin` to count listings within radius per category.

### 4.4 Augment — System Prompt with Retrieved Data
**File:** `src/modules/ai/ai-search.service.ts` — lines 159–209

```typescript
private buildSystemPrompt(availableSlugs: string[], followUpUsed: boolean): string {
  return `You are a search query parser for a rental marketplace.
  
  CRITICAL RULES:
  3. Available categories: ${availableSlugs.join(', ')}  // ← RETRIEVED DATA INJECTED HERE
  4. Only use categorySlug from the available list above.
  2. Maximum ${maxFollowUp} follow-up question. If followUpUsed=true, MUST return RESULT.
  ...`;
}
```

This is the RAG augmentation: **the list of real categories near the user is injected into
the prompt so Gemini can only pick from real, DB-verified options.**

### 4.5 Augment — User Prompt with Query Context
**File:** `src/modules/ai/ai-search.service.ts` — lines 211–225

```typescript
private buildUserPrompt(dto: AiSearchRequestDto): string {
  let prompt = `Query: "${dto.query}"`;
  if (dto.lat && dto.lng) {
    prompt += `\nLocation: lat=${dto.lat}, lng=${dto.lng}, radius=${dto.radiusKm}km`;
  }
  if (dto.followUpUsed && dto.followUpAnswer) {
    prompt += `\nFollow-up answer: "${dto.followUpAnswer}"`;
  }
  prompt += `\nfollowUpUsed: ${dto.followUpUsed || false}`;
  return prompt;
}
```

### 4.6 Generate — Gemini Call + Validation
**File:** `src/modules/ai/ai-search.service.ts` — lines 142–156

```typescript
const aiResult = await this.aiService.generateCompletion(userPrompt, {
  systemPrompt,       // contains the retrieved category slugs
  temperature: 0.3,   // low = more deterministic
  maxTokens: 800,
});

const parsed = this.safeJsonParse(aiResult);     // extract JSON from response
return this.normalizeAiResponse(parsed, dto, availableSlugs);  // validate + guard
```

### 4.7 Guardrail: Category Whitelist
**File:** `src/modules/ai/ai-search.service.ts` — lines 27–32

```typescript
export const ALLOWED_CATEGORY_SLUGS = [
  'stays', 'sports-facilities', 'mobility', 'beach-gear',
] as const;
```

Even if Gemini hallucinates a categorySlug not in this list, `normalizeAiResponse` silently
discards it. The retrieved nearby slugs are intersected with this whitelist before sending
to Gemini — so hallucination is structurally impossible.

### 4.8 Two-Turn Conversation Guard

If `followUpUsed: true` is sent in the request (meaning the user already answered a
follow-up), the system prompt tells Gemini: *"Maximum 0 follow-up questions — you MUST
return RESULT mode."* This prevents infinite loops.

---

## 5. Feature 2: AI Price Suggestion (RAG for pricing)

**Entry point:** `POST /api/ai/price-suggestion`
**Service:** `src/modules/ai/price-suggestion.service.ts`
**DTO:** `src/modules/ai/dto/price-suggestion.dto.ts`

### 5.1 What it does

A host asks: "How much should I charge for my 8-person beachfront villa in Kelibia?"

The system returns:
```json
{
  "recommended": 426,
  "range": { "min": 341, "max": 511 },
  "compsUsed": 25,
  "confidence": "medium",
  "explanation": [
    "The 426 TND price is anchored to 18 beachfront listings within 25 km.",
    "Your villa's sea proximity (0.2 km) commands a 45% premium.",
    "Summer season multiplier (+20%) applies to peak period pricing."
  ]
}
```

**The numbers (426, 341, 511) are computed from real database comps. Gemini only
writes the 3 explanation sentences. The AI cannot change the price.**

### 5.2 The Full 10-Step Pipeline

**File:** `src/modules/ai/price-suggestion.service.ts` — method `_suggest()` — lines 215–407

```
Step 1  — Fetch raw comps (SQL + PostGIS)
Step 2  — Score + select top-K comps (similarity scoring)
Step 3  — Compute base price (weighted median)
Step 4  — Accommodation-specific adjustments (sea tier, property type, capacity)
Step 5  — Apply seasonal multiplier
Step 6  — Compute price range (IQR from comparables) ← RANGE IS ALWAYS COMP-DRIVEN
Step 7  — Compute confidence band
Step 8  — Build explanation (the only step that calls Gemini) ← RAG GENERATION
Step 9  — Write audit log (fire-and-forget)
Step 10 — Apply output guardrails (clamp outliers)
```

### 5.3 Step 1 — RETRIEVE: PostGIS Geospatial SQL
**File:** `src/modules/ai/price-suggestion.service.ts` — method `fetchCompsGeo()` — line 582+

```sql
SELECT
  l.id                    AS "listingId",
  l.price_per_day::float  AS "listingPrice",
  l.near_beach            AS "nearBeach",       -- boolean: within 500m of sea
  l.property_type         AS "propertyType",    -- 'villa' | 'house' | 'apartment'
  l.guests_capacity       AS "guestsCapacity",  -- max number of guests
  l.bedrooms              AS "bedrooms",
  ST_Distance(l.location, user_point) AS "distanceM",
  -- Use real booking price when available (actual market transaction):
  (SELECT b.snapshot_price_per_day FROM bookings b
   WHERE b.listing_id = l.id AND b.status IN ('confirmed','paid','completed')
   ORDER BY b.created_at DESC LIMIT 1)          AS "bookedPrice"
FROM listings l
JOIN categories c ON c.id = l.category_id
WHERE l.is_active = true
  AND c.slug = 'stays'                          -- category filter
  AND ST_DWithin(l.location, user_point, 25000) -- within 25 km
ORDER BY "distanceM" ASC
LIMIT 60
```

**The key point:** It fetches `bookedPrice` from real confirmed bookings — this is
**actual transaction data**, not asking prices. Ground truth.

### 5.4 Step 2 — Score Comps by Similarity
**File:** `src/common/utils/comp-scorer.ts`

Each retrieved comp is scored 0–1 using 4 dimensions with fixed weights:

```
score = 0.40 × locationScore     (distance from target property)
      + 0.25 × typeScore         (propertyType match: villa vs house vs apartment)
      + 0.20 × sizeScore         (guestsCapacity similarity)
      + 0.15 × amenityScore      (bedroom count / amenity overlap)
```

If a field is missing → **0.5 (neutral)** — score is never undefined.
Top-K comps are selected: 30 city comps (min score 0.10) + 80 national comps (min score 0.05).

### 5.5 Step 6 — Range from Comps (NOT from AI)
**File:** `src/modules/ai/price-suggestion.service.ts` — lines 263–313
**File:** `src/common/utils/price-range.ts`

```
p25  = similarity-weighted 25th percentile of comp prices
p75  = similarity-weighted 75th percentile of comp prices
IQR  = p75 - p25
rangeMin = p25 - 20% × IQR
rangeMax = p75 + 20% × IQR
```

For accommodation, the IQR pool is filtered to only comps that share
the query's `nearBeach` signal (e.g., beachfront villas are only compared
to other beachfront listings, not inland properties).

**This means Gemini CANNOT affect the numeric output.** If you remove the
Gemini key, `recommended`, `rangeMin`, `rangeMax` are identical.

### 5.6 Step 8 — AUGMENT + GENERATE: Gemini Explains the Range
**File:** `src/modules/ai/price-suggestion.service.ts` — method `buildExplanation()` — line 908+

```typescript
// Augment: inject the retrieved/computed facts into a prompt
const prompt = `You are a pricing analyst for a Tunisian rental platform.
Write EXACTLY 3 short explanation bullets justifying the suggested price of ${recommended} TND.

Listing details:
- City: ${dto.city}                                    // Kelibia
- Property type: ${dto.propertyType}                   // villa
- Distance to sea: ${dto.distanceToSeaKm} km (beachfront)
- Capacity: ${dto.capacity} guests                     // 8
- Weighting: Price based on ${cityComps} local comparables in ${dto.city}.  // ← RETRIEVED FACT
- Applied adjustments: ${adjustments.join('; ')}       // ← COMPUTED ADJUSTMENTS

Reply with a JSON array of exactly 3 strings.
["Reason 1.", "Reason 2.", "Reason 3."]`;

// Generate: call Gemini with the augmented prompt
const raw = await this.aiService.generateCompletion(prompt, {
  maxTokens:    280,
  temperature:  0.5,
  systemPrompt: 'You are a concise pricing analyst. Always respond with a valid JSON array of 3 strings.',
});
```

If Gemini is unavailable (no key or API error), `heuristicExplanation()` generates
deterministic template-based sentences. The numeric output is unchanged either way.

---

## 6. Data Flow Diagram

```
HOST REQUEST: "Villa, Kelibia, 0.2km from sea, 8 guests"
       │
       ▼
┌─────────────────────────────────────────────────┐
│  Step 1: RETRIEVE (PostGIS SQL)                 │
│  → 25 listings within 25km                     │
│  → Real booking prices (confirmed transactions) │
│  → nearBeach, propertyType, capacity, bedrooms  │
└─────────────────┬───────────────────────────────┘
                  │ 25 CompRow objects
                  ▼
┌─────────────────────────────────────────────────┐
│  Step 2: SCORE (comp-scorer.ts)                 │
│  → Each comp scored 0–1 across 4 dimensions     │
│  → Top 30 city + 80 national comps selected     │
└─────────────────┬───────────────────────────────┘
                  │ ScoredComparableListing[]
                  ▼
┌─────────────────────────────────────────────────┐
│  Steps 3–7: COMPUTE (pure math, no AI)          │
│  → Weighted median → recommended = 426 TND      │
│  → IQR from beachfront-filtered comps           │
│  → rangeMin = 341, rangeMax = 511               │
│  → confidence = "medium"                        │
└─────────────────┬───────────────────────────────┘
                  │ numbers + metadata
                  ▼
┌─────────────────────────────────────────────────┐
│  Step 8: AUGMENT + GENERATE (RAG core)          │
│  → Build prompt: inject city, compsUsed,        │
│    adjustments, recommended, seaTier            │
│  → Call Gemini via @google/genai SDK            │
│  → Parse JSON array of 3 strings                │
│  → explanation = ["...", "...", "..."]           │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
        RESPONSE TO HOST:
        {
          recommended: 426,     // from DB comps
          range: {min:341,max:511}, // from DB comps
          compsUsed: 25,        // from DB
          explanation: [...]    // from Gemini
        }
```

---

## 7. Key Files Summary

| File | Role |
|------|------|
| `src/modules/ai/providers/gemini.provider.ts` | Wraps `@google/genai` SDK, handles API call + timeout |
| `src/modules/ai/providers/openai.provider.ts` | Alternative provider (same interface) |
| `src/modules/ai/ai.service.ts` | Provider switcher via `AI_PROVIDER` env var |
| `src/modules/ai/ai-search.service.ts` | RAG for search: retrieves nearby categories, augments system prompt |
| `src/modules/ai/price-suggestion.service.ts` | RAG for pricing: retrieves comps via PostGIS, augments explanation prompt |
| `src/common/utils/comp-scorer.ts` | Similarity scoring (4 dimensions, weights sum to 1) |
| `src/common/utils/price-range.ts` | IQR-based range calculation (no AI involved) |
| `src/common/utils/output-guardrails.ts` | Clamps NaN/outliers in price output (±20% guardrail) |
| `src/modules/ai/schemas/ai-response.schema.ts` | Zod schema — validates Gemini's JSON output |

---

## 8. Environment Variables Required

```bash
# Required for Gemini (default provider)
AI_PROVIDER=gemini
GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-2.0-flash   # optional, this is the default

# Alternative: OpenAI
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...

# Database (PostGIS must be enabled)
DATABASE_URL=postgresql://user:pass@localhost:5433/rental_platform
```

---

## 9. Proof That RAG Works (What to Check)

### Check 1: compsUsed > 0
```bash
curl -X POST http://localhost:3001/api/ai/price-suggestion \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"city":"Kelibia","category":"accommodation","unit":"per_night",
       "propertyType":"villa","distanceToSeaKm":0.2,"capacity":8,
       "lat":36.8497,"lng":11.1047,"radiusKm":25}'
# compsUsed should be ≥ 8 — means real listings were retrieved
```

### Check 2: Ranges don't overlap between villa and house
```
Villa (beachfront, 8 guests): rangeMin=341, rangeMax=511
House (inland, 4 guests):     rangeMin=194, rangeMax=291

341 > 291  ← PROOF the range is driven by actual comp data,
             not by the AI guessing a generic price
```

### Check 3: Server log confirms Gemini was called
```
LOG [AiService] AI provider selected: gemini (model: gemini-2.0-flash)
```

### Check 4: Removing AI key doesn't change the numbers
Set `GEMINI_API_KEY=""` and retry. The `recommended` and `range` values are
identical. Only the `explanation` text degrades to heuristic sentences.
This proves the numbers are comp-driven, AI is only for explanation text.

---

## 10. What RAG Is NOT in This Project

| Not Used | Why |
|----------|-----|
| Vector embeddings | Listings are structured data — geospatial SQL is more precise than cosine similarity |
| Pinecone / Qdrant / Weaviate | No vector store — PostgreSQL with PostGIS replaces it |
| LangChain / LlamaIndex | Not used — the RAG pipeline is hand-coded in NestJS services |
| Fine-tuning | Not used — Gemini is prompted with real data at inference time |
| Streaming | Not used — single-turn completions only |