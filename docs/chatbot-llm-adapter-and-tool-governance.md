# Chatbot LLM Adapter & Tool Governance

## 1. Problem Being Solved
The original implementation of the Chatbot tightly coupled the internal orchestration memory structures directly to OpenAI-specific JSON arrays (`tool_calls: [...]`, `tool_call_id`). Furthermore, tool execution logic lived inside a single hardcoded switch statement, making it fragile and non-extensible for future features. Execution lacked deterministic partial failure states, robust timeout bounds, structured logging, and robust runtime validation layers beyond vanilla `typeof === 'object'` checks.

## 2. Architecture Before vs After
**Before:**
`ChatbotOrchestrator` -> Reconstructs OpenAI payload -> Calls OpenAI -> Calls `ChatbotToolsService.executeTool("search_listings")` -> Parses `JSON.parse` manually.

**After:**
`ChatbotOrchestrator` -> Reconstructs internal agnostic history (`LlmConversationTurn[]`) -> Passes to `ILlmAdapter` (OpenAiChatAdapter).
When LLM returns a generic `LlmToolRequest`, the Orchestrator passes the request into the **Tool Governance Layer** (`ToolGovernanceService`). 
The policy securely bounds access, the registry validates using `Zod`, executing safely with an enforced `executionTimeoutMs` bound, wrapping gracefully against failure statuses.

## 3. Internal LLM Abstraction Design
Located in `src/chatbot/llm/llm.types.ts` and `llm-adapter.interface.ts`.
- Extracts `LlmConversationTurn`, `LlmAssistantOutput`, `LlmGenerationOptions`, and `LlmToolRequest` cleanly so orchestrator states are agnostic.
- Ensures future compatibility if we migrate to Gemini, Anthropic, or an internal model. The legacy database `_callId` formatting logic has been generalized.

## 4. Tool Governance Flow
Located in `src/chatbot/tools/`.
1. **Tool Policy Service**: Blocks access. Identifies if the requested tool belongs to the granted allowlist for this context.
2. **Tool Registry Service**: Maps tool commands to schemas, metadata, and handler scopes organically securely.
3. **Tool Governance Service**: Takes the inbound request string payload, attempts Zod runtime evaluation (stripping malicious properties), executes within `Promise.race()` to enforce timeout bounds, formats standard `GovernedToolResult`, and records standardized logging natively.

## 5. Schema Validation Strategy
Migrated from ad hoc object testing to `Zod`.
- Strict stripping (`.strip()`) drops unused JSON keys automatically.
- **Type Coercion**: We implemented `.coerce.number()` targeting fields like `radiusKm` natively protecting parsing structures against OpenAI randomly stringifying JSON payload parameters inherently preventing 500 crashes.
- Radius bounds max at `50` strictly via `.coerce.number().max(50).default(10)`.
- Validations are caught centrally natively without needing handler implementation overrides resulting in a `"validation_error"` governed return.

## 6. Category Mapping Source of Truth
Located in `src/chatbot/constants/chatbot-category-map.ts`.
Extracts the business logic strictly: the AI natively discusses `accommodation` while internally the app routes `stays`. This mapping exists exactly in a single file avoiding prompt logic drift alongside filtering rules globally.

## 7. Configured Guardrails
- **Max Processing Iterations (`CHATBOT_MAX_TOOL_ROUNDS`)**: Defaults to 3. Forces the orchestrator loop to end forcefully gracefully if infinite generation chains emerge returning: `I've searched extensively but reached my processing limit.`
- **Max Tools Per Turn (`CHATBOT_MAX_TOOL_CALLS_PER_TURN`)**: Array arrays returned securely capped natively utilizing `.slice()` ensuring malicious payload injection truncates at 5 avoiding concurrent DB overflow mapping.
- **Tool Execution Timeout (`CHATBOT_TOOL_TIMEOUT_MS`)**: Enforced at 10 seconds locally. Yields a graceful `"timeout"` governed status utilizing `Promise.race()` natively securely preventing 504 server freezes globally.
- **Max Response Boundaries (`CHATBOT_MAX_TOOL_RESULT_SIZE`)**: The underlying service slices bounds enforcing maximum token overhead defaults at 10 items statically globally.

## 7.1 Structured Telemetry Logging
Replaced blunt JSON.stringified raw dumping. Sub-execution pipelines now build explicitly constructed PII-secured mapping blocks dumping purely duration sizes and user bindings seamlessly natively avoiding GDPR mapping violations.

## 8. Deterministic Error Handling
The orchestrator receives `status: ToolExecutionStatus` natively:
- `success`
- `timeout`
- `validation_error`
- `policy_blocked`
- `execution_error`
- `not_found`
These statuses elegantly inject directly back into the LLM context informing it to try again or modify inputs dynamically instead of 500ing out to the end user recursively.

## 9. Next Steps / Future Extensibility
To add a new internal tool:
1. Generate `new-tool.schema.ts` strictly bound with Zod properties.
2. Build a handler inside `tool-governance.service.ts` or inject new providers cleanly binding back mapping into `registerTool`.
3. Inform `tool-policy` mappings adding strings organically based on authorization roles mapped seamlessly.

## 10. Test Coverage Summary
Extended explicitly covering:
- `ts-jest` mocking LLM adapter boundaries isolating OpenAI networks securely.
- Tool boundaries dynamically rejecting unstructured payloads dropping malformed array hacks gracefully mapping to `.status === 'validation_error'`.
- Verified unknown payload keys are correctly blocked gracefully from downstream functions correctly executing bounds.
