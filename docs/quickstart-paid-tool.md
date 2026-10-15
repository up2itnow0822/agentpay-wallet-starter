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
npm test
```

This runs root regressions and the evidence harness in
`examples/controlled-paid-tool/validate_demo.js`, checking:
- allowed payment completes
- approval-required payment completes when auto-approved
- blocked payment stops before settlement
- denied, unset and unrecognized approval stop before settlement
- receipts, result IDs, effective policy and ordered audit events agree
- malformed config, inherited scenario names and failed runs fail closed

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
npm run demo:approval
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

To override the embedded policy with the standalone example:

```bash
node examples/controlled-paid-tool/run_demo.js allowed --policy configs/policy.example.json
```

Unknown or incomplete flags fail. All prices are finite nonnegative USD numbers;
the tool remains a local simulation. A failed run exits nonzero and writes a
failed summary and terminal audit event, retaining any simulated receipt already
obtained. Do not interpret an older successful run as the result of a failure.

## What to record

The repo is doing its job when you can answer:
- what did you change first
- why did you change it
- which scenario still matched your use case best
- what outcome you expected after the change
