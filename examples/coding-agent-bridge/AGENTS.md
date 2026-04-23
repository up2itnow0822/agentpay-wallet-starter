# AGENTS.md

## Goal

Use OpenAI Agents SDK with `agentpay-mcp` for paid tool access without giving custody to the orchestration layer.

## Payment rules

- Never send funds unless the merchant or endpoint is on the allowlist.
- Reject any payment above `AGENTPAY_MAX_USDC_PER_TX`.
- Stop and ask for approval before retrying a paid request if the total session spend would cross the daily cap.
- Log the quoted amount, payee, tool name, and receipt id for every paid call.
- In WebSocket mode, keep the same payment checks before every follow-up `response.create` that continues from `previous_response_id`.
- If a retry would cross a daily cap on a persistent connection, stop and ask for approval instead of looping.

## Coding rules

- Prefer MCP tools over raw HTTP calls when a paid tool is already exposed through `agentpay-mcp`.
- Keep edits inside this example folder unless asked to widen scope.
- When touching docs, keep the code snippets runnable and keep the shell commands copy-paste safe.

## Failure rules

- If the wallet is unfunded, return a structured blocker instead of faking success.
- If the x402 challenge is malformed, fail closed.
- If the spend policy blocks the call, explain which cap or rule triggered the rejection.
