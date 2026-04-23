# Policy example

This repo ships one validated starter policy example:

- `configs/policy.example.json`

```json
{
  "allowedTools": ["premium_weather_signal"],
  "approvalThresholdUsd": 0.25,
  "hardCapUsd": 1.0
}
```

## What this shape is

This is the exact policy shape used by the controlled paid-tool example in this repo.

It proves three states:
- allowed
- approval required
- blocked

Those behaviors are validated by:
- `examples/controlled-paid-tool/validate_demo.js`
- `scripts/verify-starter.sh`

## What each field means

- `allowedTools`: which tool names are allowed to request payment at all
- `approvalThresholdUsd`: amounts above this require approval
- `hardCapUsd`: amounts above this are blocked

## Important boundary

This file is a validated starter policy example for the controlled demo and a good way to think about your first guardrails.

It is not currently a verified drop-in runtime config contract for the shipped `agentpay-mcp` server.

What is verified today:
- the controlled demo consumes this JSON shape directly
- the current `agentpay-mcp` server exposes spend controls through wallet creation and spend-limit tools such as `createWallet` and `setSpendLimit`

So use this file in two ways:
1. as the exact policy file for the controlled paid-tool example in this repo
2. as the starter model for the limits and approval rules you want to preserve when you move into a real MCP-client flow

## How to adapt it

Change one thing at a time:
- tool allowlist
- approval threshold
- hard cap

Then rerun:

```bash
bash scripts/verify-starter.sh
```

Or run a single scenario:

```bash
node examples/controlled-paid-tool/run_demo.js allowed
NEMOCLAW_AUTO_APPROVE=yes node examples/controlled-paid-tool/run_demo.js approval
node examples/controlled-paid-tool/run_demo.js blocked
```
