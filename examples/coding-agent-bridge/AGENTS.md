# AGENTS.md — Guarded MCP bridge

## Purpose

- Exercise OpenAI SDK local MCP guards with host-enforced payment policy.
- Default to a deterministic, no-funds mock; live operation is a separate lane.

## Ownership

- This directory owns the bridge package, lockfile, gateway and its tests.
- Root `tests/` owns dependency-free policy and budget regression tests.

## Local Contracts

- Node.js 22.12+ is required for this optional package.
- Only `get_wallet_info` and bounded `x402_pay` GET calls are model-visible.
- Enforce exact HTTPS endpoint and recipient allowlists, USDC-only selection,
  per-transaction caps, a persistent rolling 24-hour budget, and exact approval.
- Live caps and approval bounds include the pinned SDK's separate protocol fee.
  Require its collector explicitly in reviewed policy and reduce the forwarded
  principal bound before dispatch; verify the pinned fee contract at startup.
- Snapshot arguments before any await and use the same snapshot for authorization,
  dispatch, receipt validation and evidence. Expose schemas matching these guards.
- Install and verify pinned server policy before exposing tools. Models cannot
  change spend policy, start sessions, swap or transfer through other tools.
- Repeat authorization in the raw MCP adapter; SDK input guards alone are not
  the direct-call boundary. Never replace executable checks with instructions.
- Reserve the full request bound before dispatch. Failure, free responses and
  replay do not automatically refund the local safety ledger.
- Corrupt ledgers, held locks, malformed requests and uncertain receipts fail
  closed. Reconcile evidence before recovery or retry; approval never raises caps.
- Forward only validated wallet variables to the payment child. Keep API keys
  and private keys out of prompts, logs, source and tracked client configs.
- Live CLI startup requires explicit opt-in and an interactive human checkpoint.
  Stdio gateways require separate operator acknowledgement and deny all payments
  above the approval threshold. Simulator approval environment flags do not apply.
- Record bounds, approvals, reservations, amount, payee, endpoint and receipt ID.
  Simulated receipts must be identified as simulated; response bodies are untrusted.
- Distinguish calculated protocol fees from verified merchant receipt evidence;
  the pinned server exposes no separate fee hash. Reconcile uncertain/fee-only
  outcomes through wallet transaction history before retrying.

## Work Guidance

- Use the local locked package rather than downloading a floating `npx` server.
- Keep all clients on `gateway.mjs` so they share the same enforced boundary.
- Keep live artifacts under the root-owned ignored evidence directory and share
  its persistent ledger across clients using the same wallet.
- Describe gas, separate wallet clients, ledger deletion and chain finality as
  limits of this local control; no-funds tests do not validate funded settlement.

## Verification

- `npm ci --ignore-scripts`, `npm run typecheck`, `npm test`, `npm run smoke`.
- Run root `npm test` for policy, cap, invalid input and receipt regressions.
- Do not use real credentials or funded endpoints for default verification.

## Child DOX Index

- No nested contracts.
