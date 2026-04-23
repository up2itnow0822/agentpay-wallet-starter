# Coding-agent bridge

This example shows how to plug `agentpay-mcp` into the OpenAI Agents SDK so an agent can:

- discover payment tools over MCP
- keep local wallet custody with `agentwallet-sdk`
- gate paid calls behind approval and spend policy
- preserve OpenAI-native sessions, guardrails, and tracing

## Why this exists

This is the second lane inside `agentpay-wallet-starter`.

OpenAI's updated agent stack now gives developers most of the harness they need: MCP server tools, sessions, guardrails, Codex CLI, sandbox execution, `AGENTS.md`, and shell-style workflows. What it still does not ship is a native payment primitive.

That leaves a gap right where real agents hit one. An agent can reason, call tools, and write code, but it still needs a safe way to pay for premium APIs, MCP tools, data feeds, and operator-approved actions.

This bridge fills that gap with three layers:

1. `@openai/agents` for orchestration
2. `agentpay-mcp` for the payment tool surface
3. `agentwallet-sdk` for non-custodial signing and spend controls

## Files

- `agent.ts` - minimal OpenAI Agents SDK integration
- `AGENTS.md` - repository policy the coding agent can read before it edits or pays
- `websocket-control-points.md` - where approval gates, spend limits, and x402 checkpoints sit in a persistent Responses API loop

## Install

From this example directory:

```bash
npm install @openai/agents zod agentpay-mcp agentwallet-sdk tsx
```

## Environment

```bash
export OPENAI_API_KEY=sk-...
export BASE_RPC_URL=https://mainnet.base.org
export BASE_PRIVATE_KEY=0x...
export AGENTPAY_MAX_USDC_PER_TX=1
export AGENTPAY_MAX_USDC_PER_DAY=5
```

Use a low-cap wallet for demos. Raise limits only after you have alerts and review in place.

## Run

From this example directory:

```bash
npx tsx agent.ts
```

## What the bridge maps cleanly

| OpenAI primitive | What we attach |
| --- | --- |
| MCP server tools | `agentpay-mcp` over stdio |
| Sessions / working memory | OpenAI session state plus payment receipts in your app logs |
| Guardrails / approval | OpenAI approval flow plus `agentwallet-sdk` spending policy |
| Codex + `AGENTS.md` | repo-level payment policy, file hygiene, and approval rules |
| Shell / sandbox work | local code edits stay in the harness, funds stay in the wallet layer |

## Architecture

```text
OpenAI Agent
  -> MCP call
  -> agentpay-mcp
  -> agentwallet-sdk
  -> x402 challenge / payment proof
  -> paid API or paid MCP tool
```

## When to use this lane

Use this after the controlled paid-tool example works and you want to see the same payment boundary inside an MCP-client workflow.

## What to ship first

If you are turning this into a production path, ship in this order:

1. local stdio MCP server with tiny spend caps
2. approval for any transfer above your default threshold
3. allowlist of merchants or API domains
4. receipt logging for every paid call
5. policy tests for reject, approve, and cap-exceeded cases

## WebSocket mode: where the controls sit

OpenAI's Apr 22 engineering post explains that WebSocket mode keeps connection-scoped response state in memory and lets follow-up calls reuse `previous_response_id` instead of rebuilding the full conversation each turn.

That reduces latency. It does not remove the money boundary.

When you adapt this bridge to a persistent Responses API loop, keep the checkpoints in this order:

1. Open the WebSocket connection and send the first `response.create`.
2. Let the model plan work and emit a paid tool call or a paid HTTP step.
3. Before any funds move, check merchant allowlist, per-tx cap, daily cap, and approval threshold.
4. Use `agentpay-mcp` plus `agentwallet-sdk` to satisfy the x402 challenge only if policy allows it.
5. Log quote amount, payee, approval state, and receipt id.
6. Continue the conversation with a follow-up `response.create` that references `previous_response_id` and includes the paid tool result.
7. Fail closed on malformed challenges, unknown merchants, or cap-exceeded retries.

The companion note in `websocket-control-points.md` shows the control path in more detail.

## Source notes

- OpenAI Agents SDK overview: https://openai.github.io/openai-agents-js/
- OpenAI MCP guide: https://openai.github.io/openai-agents-js/guides/mcp/
- Codex CLI overview: https://developers.openai.com/codex/cli/
