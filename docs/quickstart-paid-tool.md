# Quickstart: controlled paid-tool flow

This is the first path to run in `agentpay-wallet-starter`.

It proves three outcomes:
- allowed
- approval required
- blocked

## Prerequisite

Use Node 20 or newer.

## Validate the full starter lane

From repo root:

```bash
bash scripts/verify-starter.sh
```

This runs the validation harness in `examples/controlled-paid-tool/validate_demo.js` and checks:
- allowed payment completes
- approval-required payment completes when auto-approved
- blocked payment stops before settlement

## Run scenarios one by one

### Allowed

```bash
node examples/controlled-paid-tool/run_demo.js allowed
```

Expected outcome:
- payment challenge received
- policy decision is `allowed`
- payment settles
- tool result returns
- final outcome is `allowed_paid_and_completed`

### Approval required

```bash
NEMOCLAW_AUTO_APPROVE=yes node examples/controlled-paid-tool/run_demo.js approval
```

Expected outcome:
- payment challenge received
- policy decision is `approval_required`
- approval is granted
- payment settles
- tool result returns
- final outcome is `approval_paid_and_completed`

### Blocked

```bash
node examples/controlled-paid-tool/run_demo.js blocked
```

Expected outcome:
- payment challenge received
- policy decision is `blocked`
- payment stops before settlement
- final outcome is `blocked_by_policy`

## Adapt it to your use case

Edit:
- `examples/controlled-paid-tool/demo.config.json`

Change one thing at a time:
- spend limits
- approval thresholds
- tool name
- goal text
- tool input

Then rerun the scenario that best matches your use case.

## What to record

The repo is doing its job when you can answer:
- what did you change first
- why did you change it
- which scenario still matched your use case best
- what outcome you expected after the change
