# WebSocket control points for x402

OpenAI's Apr 22 engineering post on the Responses API says WebSocket mode keeps connection-scoped state in memory and uses `previous_response_id` on follow-up `response.create` calls so the server can reuse prior response state instead of rebuilding the full conversation on every turn.

That is a transport and latency improvement.

It is not a payment-policy layer.

This note shows where approval gates, spend limits, and x402 checkpoints should sit when you adapt the bridge to a persistent connection.

## Control path

```text
client app
  -> open Responses API WebSocket
  -> response.create
  -> model plans tool step
  -> paid tool or paid HTTP boundary reached
  -> policy check: allowlist + per-tx cap + daily cap + approval threshold
  -> agentpay-mcp
  -> agentwallet-sdk
  -> x402 quote / payment proof / receipt
  -> response.create with previous_response_id + tool result
  -> model continues
```

## What must happen before payment

Before you satisfy an x402 challenge inside a WebSocket-fast loop, check all four of these locally:

1. Merchant or endpoint allowlist
2. Per-transaction spend cap
3. Daily session or wallet budget
4. Approval threshold for exceptional spends or retries

If any check fails, return a structured rejection into the agent loop. Do not quietly retry.

## Why the check has to stay outside the transport layer

The Responses API can keep the conversation state hot in memory. That is useful for latency.

But the transport layer should not be the source of truth for wallet custody or spend policy.

Keep that split clean:

- OpenAI loop: planning, context reuse, tool orchestration
- `agentpay-mcp`: bounded payment tool surface
- `agentwallet-sdk`: keys, signing, spend policy
- app logs: quote, approval, receipt, outcome

That way, the orchestration layer can change without moving the wallet boundary.

## Recommended failure behavior

Fail closed in these cases:

- malformed x402 challenge
- merchant not on allowlist
- per-tx cap exceeded
- daily cap exceeded
- retry would cross budget without approval
- missing receipt id after a paid call

Return a structured error that tells the model which policy blocked the payment.

## Minimal follow-up pattern

After a successful paid step:

1. record quote amount, payee, approval state, and receipt id
2. send the paid tool result back with a follow-up `response.create`
3. include `previous_response_id` so the server reuses the cached response state
4. continue the loop only after the receipt is durable in your app logs

## Source

- OpenAI engineering post: https://openai.com/index/speeding-up-agentic-workflows-with-websockets/
