# Controlled paid-tool example

This is the canonical first-success lane inside `agentpay-wallet-starter`.

It shows a local agent hitting one paid capability, receiving a simulated payment challenge, running a real spend-policy gate, optionally requiring human approval, and writing a persistent audit trail.

## What is real vs simulated

### Real
- spend policy evaluation
- approval gate behavior
- blocked / approval-required / allowed decisions
- persisted audit artifacts
- deterministic validation script

### Simulated
- the paid tool itself
- the payment challenge and settlement receipt
- the final premium result payload

No real funds are required for the default demo.

## Prerequisites

- Node.js 20+
- this repo checked out locally

No package install is required for this example.

## Quickstart

From the starter repo root:

```bash
node examples/controlled-paid-tool/run_demo.js allowed
NEMOCLAW_AUTO_APPROVE=yes node examples/controlled-paid-tool/run_demo.js approval
node examples/controlled-paid-tool/run_demo.js blocked
```

Or run the deterministic validation pass:

```bash
node examples/controlled-paid-tool/validate_demo.js
```

## What you should see

### Allowed path
- tool returns a simulated payment challenge for `$0.18`
- policy auto-allows it because it is at or below the `$0.25` threshold
- payment settles in simulated mode
- tool result is returned
- outcome is `allowed_paid_and_completed`

### Approval-required path
- tool returns a simulated payment challenge for `$0.65`
- policy marks it `approval_required`
- terminal prompt or `NEMOCLAW_AUTO_APPROVE=yes` approves it
- payment settles in simulated mode
- tool result is returned
- outcome is `approval_paid_and_completed`

### Blocked path
- tool returns a simulated payment challenge for `$1.25`
- policy blocks it because the hard cap is `$1.00`
- no payment is settled
- no tool result is returned
- outcome is `blocked_by_policy`

## Audit output

Each run writes:

- `artifacts/audit-log.jsonl` for append-only event history
- `artifacts/latest-run.json` for the most recent run summary
- `artifacts/run_*.json` for per-run summaries

The validation command also writes per-scenario transcripts and summaries under:

- `artifacts/validation/`

## Demo shape

- `demo.config.json` defines the tool, thresholds, and scenario prices
- `run_demo.js` runs the local agent/payment-control loop
- `validate_demo.js` proves the three required policy states end to end
- `lib/` contains the policy, approval, audit, and simulator modules

## Why this exists

This example is intentionally narrow. It is a small, inspectable proof that a local agent flow can keep paid-tool usage policy-gated, approval-aware, and auditable without requiring real funds for the first review.

Inside `agentpay-wallet-starter`, this is the path users should run before they touch the MCP-client bridge or the bring-your-own-endpoint lane.
