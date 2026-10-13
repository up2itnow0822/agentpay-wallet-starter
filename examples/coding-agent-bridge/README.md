# Guarded coding-agent bridge

This optional example uses the pinned OpenAI Agents SDK and a local stdio MCP
server. The default smoke uses a deterministic model and a mock payment server:
no OpenAI API key, RPC request, wallet, or real payment is needed.

## Install and verify

Use Node.js 22.12+ (the locked OpenAI client requires Node 22 and the pinned
server needs enabled `require(esm)`). From this example directory:

```bash
npm ci --ignore-scripts
npm run typecheck
npm test
npm run smoke
```

The smoke exercises the actual SDK tool dispatch and its input guard. Tests also
bootstrap the pinned AgentPay server without making paid calls. Dependencies are
locked here separately from the dependency-free root simulator.

## Enforced payment boundary

The model sees only `get_wallet_info` and `x402_pay`. The SDK input guard rejects
invalid requests before dispatch; the MCP adapter repeats authorization so direct
MCP calls cannot bypass it. Policy is installed and its echoed values verified
before any tool is available. Policy, transfer, swap and session mutation tools
are unavailable to the model.

`policy.example.json` is a mock template. A reviewed live policy must contain:

| Field | Contract |
| --- | --- |
| `allowedEndpoints` | Nonempty list of exact HTTPS URLs, including path and query |
| `allowedRecipients` | Permitted nonzero EVM payees, including the explicit live protocol fee collector |
| `maxUsdcPerTx` | Positive maximum **total USDC debit**, up to six decimals |
| `maxUsdcPerDay` | Total USDC safety budget at least as large as the transaction cap |
| `approvalThresholdUsdc` | Decimal USDC string between zero and the transaction cap |

Only GET requests and USDC on the configured Base chain are supported. Arbitrary
headers, bodies, session overrides and other assets are rejected. The pinned
server's legacy `max_payment_eth` argument represents the requested maximum
**total USDC debit** at this bridge's boundary. In live mode the adapter forwards
a smaller merchant principal cap so principal plus the pinned SDK's separate
0.77% protocol fee fits that total. Live startup fails unless the reviewed policy
explicitly includes fee collector `0xff86829393C6C26A4EC122bE0Cc3E466Ef876AdD`;
the adapter never adds a payee silently. Mock mode has no protocol fee.
The child verifies the pinned fee constants/math at startup. Actual challenge
principal and merchant are checked by the installed server policy before signing.
The server's exclusive draft threshold is one nine-decimal policy unit above the
inclusive host cap; the host and forwarded request remain bounded. Its HTTP fetch is
restricted to exact approved endpoints and the configured RPC; redirects block.
This is an application control, not an operating-system network sandbox.

The host reserves each request's full maximum before dispatch, under an exclusive
file lock. `bridge-budget.json` persists a rolling 24-hour budget across restarts
and both live entry points. Reservations remain even if a request is free, fails,
is replayed or spends less than its bound. Unknown outcomes never refund
automatically. Authorization requires file and directory sync; storage that cannot
complete either blocks the call. A corrupt ledger or held lock blocks payments; reconcile receipts
before any manual recovery. Keep this directory persistent, private and shared
by every client using the wallet. Separate clones, deleted ledgers or other wallet
clients do not share this local cap. Wallet-level spend controls remain necessary;
gas costs are outside the USDC cap.

## Live agent: separate human checkpoint

Run the no-funds checks first. Deploy and review your own compatible wallet and
on-chain limits separately, and replace the example merchant/payee. Configure
secrets locally; never commit them.

| Variable | Use |
| --- | --- |
| `OPENAI_API_KEY` | Parent OpenAI agent only; never forwarded to the payment child |
| `AGENT_PRIVATE_KEY` | Valid EVM signer key; explicitly forwarded to the payment child |
| `AGENT_WALLET_ADDRESS` | Your deployed compatible wallet address |
| `CHAIN_ID` | `84532` (Base Sepolia, default) or `8453` (Base) |
| `RPC_URL` | HTTPS RPC endpoint; defaults to the matching Base endpoint |
| `AGENTPAY_POLICY_PATH` | Absolute path to the reviewed bridge policy JSON |
| `AGENTPAY_ENABLE_LIVE` | Exact `yes`, set only after the separate human review |

```bash
npm start -- --live
```

Startup shows the chain, wallet and caps and requires the typed phrase
`enable live payments` in an interactive terminal. Above-threshold requests need
an exact `y` or `yes` approval. Caps cannot be overridden by approval.
`NEMOCLAW_AUTO_APPROVE` applies only to the root simulator, never this bridge.

## Claude, Cursor and OpenClaw

The three configs under `../../configs/` launch the local `gateway.mjs`; replace
the absolute path placeholder after installing this package. The gateway defaults
to mock mode and needs no OpenAI API key. It exposes the same two guarded tools.
Its stdio channel carries MCP messages, so it always denies requests above the
approval threshold rather than treating model text as human consent.

Live gateway startup additionally requires `AGENTPAY_MODE=live` and
`AGENTPAY_OPERATOR_ACK=reviewed-policy-and-wallet`, set by the operator only after
reviewing the wallet, merchant, policy and persistent audit directory. The live
variables above apply except `OPENAI_API_KEY`. Do not put keys in tracked configs.
An unattended gateway cannot approve larger payments; use the interactive agent
for that checkpoint.

## Evidence and limits

Evidence stays in the ignored `../controlled-paid-tool/artifacts/` directory.
`bridge-audit.jsonl` records total, principal and fee bounds, the authorized
recipients, approval decisions, reservations and merchant receipt identifiers
linked to each reservation. Receipts are parsed only
from trusted server narration, with policy-bound amount and payee checks;
merchant response bodies cannot supply receipt evidence. Errors return blockers
and retain the safety reservation for reconciliation.

The pinned server does not return a separate protocol-fee transaction hash.
Fee amounts associated with a merchant receipt are derived from the verified
fee rule; reconcile the wallet's transactions for fee-only or uncertain failures.
Do not interpret a calculated fee amount as independent chain receipt evidence.

These checks prove local authorization, configuration and simulated receipt
handling. They do not prove funded settlement, chain finality or the security of
the upstream wallet contract. Live validation requires the separate human review
and a deliberately low-cap wallet.

SDK references: [MCP](https://openai.github.io/openai-agents-js/guides/mcp/)
and [tool guardrails](https://openai.github.io/openai-agents-js/guides/guardrails/).
