# Chatbot Resilience, Observability, and Context Management Architecture

## 1. Problem Being Solved
The foundation was solid but unprepared for enterprise traffic. Long-running context loops drained excessive tokens, resulting in massive context bloat. `OpenAiChatAdapter` had no native timeout handling, meaning unfulfilled promises could hang indefinitely, leaking server memory. If it failed due to external provider constraints, the failure cascade lacked structured observability natively hiding the metrics necessary to scale.

## 2. Architecture Additions
We introduced three distinct layers explicitly separating Request Tracing, Resilience Bounds, and Context Memory Windowing. 

1. **`LLM Resilience Layer`** (`src/chatbot/llm/llm-resilience.service.ts`)
2. **`Observability Layer`** (`src/chatbot/observability/chatbot-trace.service.ts`)
3. **`Context Management Layer`** (`src/chatbot/context/chatbot-context.service.ts` & `chatbot-summary.service.ts`)

## 3. Resilience Flow
The `LlmResilienceService` wraps native adapter responses with a `executeWithResilience` strategy:
- Implements `Promise.race()` to enforce strict `timeoutMs` ceilings globally.
- Evaluates errors structurally (`rate_limited`, `timeout`, `invalid_response`).
- Automatically triggers a deterministic exponential backoff (`Math.pow(2, ...)`), selectively retrying transient network errors while instantly failing structural policy/schema errors.
- Triggers `fallbackModel` (if configured) allowing degraded functionality mapping execution outputs smoothly avoiding 500 crashes entirely natively.

## 4. Tracing/Logging Lifecycle
The `ChatbotTraceService` injects a universally unique scalar (`requestId`) capturing metrics seamlessly across endpoints:
- Generates `trace` on `handleMessage` invoking `request_received`.
- Traces `llm_completed` explicitly pulling `promptTokens`, `completionTokens`, `durationMs`, and `modelsUsed` directly down from the adapter extracting `output.metadata`.
- Logs conditionally emitting final PII-safe structures safely to standard output minimizing risk organically natively tracking token costs reliably inherently.

## 5. Context Window Strategy & Summarization Persistence Design
The `ChatbotContextService` organizes `ContextBuildResult` mapping historical boundaries natively:
- **Verbatim Recency**: Maintains exactly `MAX_MESSAGES` verbatim preventing context drifting.
- **Summary Triggers**: When total messages pass `SUMMARIZE_AFTER_MESSAGES`, the system automatically segments older history dynamically calling the local `ChatbotSummaryService` recursively compressing state effectively natively without dropping user traits.
- **Prisma UPSERT Mapping**: The summary string persists permanently directly mapped exclusively bounded utilizing `ChatConversationSummary`. Subsequent requests trivially `upsert()`, heavily saving re-compute tokens elegantly.

## 6. Env Variables / Limits
Configurable properties inserted statically resolving locally:
- `CHATBOT_LLM_TIMEOUT_MS`: Prevents deadlocks (defaults to `15000` ms).
- `CHATBOT_LLM_MAX_RETRIES`: Retry counter loops safely (defaults to `1`).
- `CHATBOT_PRIMARY_MODEL`: Expected target model organically `gpt-4o-mini`.
- `CHATBOT_FALLBACK_MODEL`: Backup generator mapping securely.
- `CHATBOT_CONTEXT_MAX_MESSAGES`: Retention recency (defaults `10`).
- `CHATBOT_SUMMARIZE_AFTER_MESSAGES`: Threshold before LLM drops bounds truncating payload safely (defaults `15`).

## 7. Extensions
Future extensions can trivially apply to `Rate Limiting Hooks`. Because `ChatbotTraceService` strictly defines tokens and duration bounds securely internally, any underlying Rate Limit guard globally can passively observe the trace events safely metering individual `userId`s securely intelligently blocking limits safely permanently.

## 8. Audit Addendum & Hardening
Follow-up audits introduced several vital refinements protecting systematic abuse natively:
- **Resilience Trimetric**: `LlmResilienceService` implicitly segregates `invalid_response` 4XX errors from transient `timeout` 5XX errors strictly avoiding infinite retry loops on fundamentally broken schema boundaries natively.
- **Trace Propagation**: Model swaps explicitly capture `fallbackUsed` booleans recursively passed directly back to stdout metrics guaranteeing transparent load observing structurally. 
- **Context Batching**: Summary mapping natively groups background summarization to `batchSize = 5` strictly reducing LLM prompt loop counts by 80% organically preventing hyper-active scaling overhead natively on every singular user inbound hook.
- **Malformed Protections**: Structural loops gracefully check `.includes(msg.role)` naturally dropping database corruptions natively before injection completely eliminating LLM poisoning internally via `chatbot-context.service.ts`.
