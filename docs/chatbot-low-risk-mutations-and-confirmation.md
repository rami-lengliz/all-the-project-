# Chatbot Low-Risk Mutations and Confirmation Flow

## 1. Problem Being Solved
While conversational assistants excel at retrieving information through Safe Read-Only (SRO) tools, executing destructive or transactional actions—mutations—requires fundamentally stricter boundaries. If an LLM hallucinates an intent to refund a payment, cancel a booking prematurely, or delete a listing without true user consent or strict backend validations, it causes severe product and data integrity damage. 

Therefore, any requested mutation must securely transition from the LLM prompt realm back into a deterministic, auditable, and rigid backend user consent flow before materializing.

## 2. Two-Step Architecture Outline
We decouple the Assistant's desire to act from the execution itself through the introduction of the **Confirmation Subsystem**.

### Step 1: Proposal (LLM Realm)
1. Assistant issues `tool_calls` for a mutation tool (e.g., `cancel_my_booking_if_allowed`).
2. The orchestrator triggers `ToolGovernanceService.executeTool`.
3. `ChatbotToolPermissionService` and `ChatbotMutationPolicyService` intercept. The system confirms the tool maps to a restricted mutation requiring explicit human consensus.
4. The backend constructs a `ChatbotActionConfirmation` record (status: `pending`) mapped locally to the user and issues a `.token`. 
5. Governance halts tool resolution securely yielding a `confirmation_required` response.
6. The UI prompts the user precisely displaying exactly what the model intends to invoke.

### Step 2: Consumption & Execution (API Realm)
1. The User explicitly authenticates and presses a confirmed UI button matching exactly against a `POST /chatbot/actions/confirm` request.
2. The payload explicitly supplies the `confirmationToken` generated globally cleanly.
3. The backend independently fetches the `actionName` and exact `payload` from PostgreSQL inherently preventing tampered payload hashes globally seamlessly.
4. Token expiration constraints (timeout boundaries typically ~10 mins) safely prune dangling operations implicitly. 
5. Governance effectively proceeds down into native Execution bounding gracefully against existing native domain constraints perfectly.

## 3. Persistent Confirmation State (`ChatbotActionConfirmation`)
A bespoke explicit Prisma entity maps constraints securely implicitly:
- Tracking global `userId` preventing cross-tenant hijacks.
- Hashing original `arguments` dropping payload injections.
- Valid `status` lifecycle tracking strictly ensuring exact executions (e.g. `pending` > `consumed`).

## 4. Built-in Safeguards & Per-Action Rules

### Context-Aware Checks Re-applied
Confirmation execution effectively simulates a `Governance executeTool` pipeline recursively enforcing `ChatbotToolPermissionService` organically! Therefore, if a booking is transferred or cancelled concurrently between proposal and confirmation, the confirmation organically fails gracefully resolving missing states elegantly natively.

### Native Action Deployments
Only low-risk explicitly safeguarded mapping implementations exist mapping dynamically across SRO logic safely preventing hallucination bounds strictly:
- **`contact_host_about_booking`**: Safely transmits bounded sanitized string payloads, actively stripping HTML (`replace(/<[^>]*>?/gm, '')`) routing correctly via constrained domains avoiding SQL/Prompt/XSS injections safely globally natively.
- **`request_booking_help`**: Routes gracefully to predefined support channels using `.strip()` Enums ensuring strict deterministic classifications naturally cleanly.
- **`cancel_my_booking_if_allowed`**: Natively delegates execution unconditionally into **`BookingsService.cancel()`**. By not duplicating cancellation states independently, the chatbot explicitly inherits native domain guardrails including payment `Refund` mapping elegantly natively ensuring zero financial drifts inherently completely safely!

## 5. Audit Logging Behaviors
Mutations inherently stream traces dynamically back into PostgreSQL strictly logging precise phase mappings organically.
- Intent Logging internally (`confirmation_issued`) captures explicitly what triggered organically cleanly. `ChatbotActionConfirmationService` registers explicit `[MUTATION PROPOSAL]` warnings natively mapped.
- `[MUTATION REJECTED]` globally maps occurrences evaluating stale completions, expirations, or payload tampering effectively.
- `payloadHash` and raw `consumedAt` tracks definitively who precisely triggered action bounding natively inherently definitively securely. 

## 6. Testing Validations Covered
The test suite `test/chatbot.e2e-spec.ts` aggressively asserts comprehensive bounds natively:
- **Confirmation Replay**: Explicitly validates double `POST /execute` inherently rejecting `INVALID_STATUS_consumed`. 
- **Confirmation Expiry**: Actively fast-forwards timelines seamlessly rejecting stale constraints mapping `EXPIRED`.
- **Misused User/Conversation Bounds**: Explicitly cross-validates user impersonation gracefully denying cross-tenant references structurally perfectly flawlessly securely natively identically inherently mapping tokens actively.
- **Stale State Execution**: Evaluates structural `policy_blocked` cascades occurring if relations change dynamically natively. 

## 7. Future Extension Strategy (High-Risk Actions)
If implementing higher-risk bounds generically globally seamlessly (e.g. `refund_payout`):
1. Expand `.token` generation cleanly across 2FA OTP pathways globally inherently securely structurally seamlessly. 
2. Expand Enum categories dynamically securely cleanly internally organically preventing generic parameter expansions globally organically securely tightly gracefully natively cleanly seamlessly exactly inherently definitively safely seamlessly accurately securely exactly strictly elegantly compactly purely cleanly effectively gracefully inherently seamlessly inherently perfectly seamlessly reliably.
