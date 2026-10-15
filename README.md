# agentpay-wallet-starter

AgentPay MCP plus Agent Wallet SDK, one clear starter path.

`agentpay-wallet-starter` starts with a local, no-funds paid-tool simulator.
An optional guarded bridge exercises the OpenAI Agents SDK and MCP tool dispatch
with a mock payment server, then provides an explicitly opted-in live adapter.

Use this repo when you want the fastest path to first success with both pieces
of the stack:

- `agentwallet-sdk` handles spend controls and x402 payment logic. It is
  non-custodial: you supply your own signer, and the SDK does not store keys
- `agentpay-mcp` exposes that capability to Claude, Cursor, OpenClaw, Codex, and
  other MCP clients
- this repo gives you the shortest path to run them together, then adapt the
  flow to your own endpoint or policy rules

If you only need one side of the stack, go straight to that package:

- use `agentwallet-sdk` if you want library-level control inside your own app or
  runtime
- use `agentpay-mcp` if you already know you want an MCP server surface
- use this repo if you want the combined path without figuring out the
  relationship from scratch

## What works today

This scaffold already includes one runnable first-success lane:

- `examples/controlled-paid-tool/` copied from the real AgentPay MCP example
  surface
- `npm test` to verify policy, approvals, receipt linkage, ordered audit evidence,
  invalid inputs, failure recovery and mutations of the safety boundaries

It also includes two next lanes:

- `examples/coding-agent-bridge/` for an MCP client flow
- `examples/bring-your-own-endpoint/` for your first adaptation pass

## Quick start

```bash
git clone https://github.com/up2itnow0822/agentpay-wallet-starter.git
cd agentpay-wallet-starter
npm ci
npm test
```

Use Node.js 20+; root verification works without Bash. `npm test` runs root
regressions and six approval/policy scenarios in simulated mode. It writes evidence under
`examples/controlled-paid-tool/artifacts/` and never moves real funds.

Run an individual scenario after the verification passes:

```bash
npm run demo:allowed
npm run demo:approval
npm run demo:blocked
```

Then adapt the path:

- change policy values in `examples/controlled-paid-tool/demo.config.json`
- rerun the scenario that matches your use case
- record what changed and why

To use the standalone policy file explicitly:

```bash
node examples/controlled-paid-tool/run_demo.js allowed --policy configs/policy.example.json
```

For the optional MCP lane, use Node.js 22.12+ and its locked package:

```bash
cd examples/coding-agent-bridge
npm ci --ignore-scripts
npm run typecheck
npm test
npm run smoke
```

This smoke uses the real SDK with a deterministic model and simulated receipts.
Live payments require the separate human checkpoint described in the bridge
README. Client configs launch its local guarded gateway in mock mode by default.
The required CI `build` check depends on root checks on Node 20/22
and bridge checks on Node 22/24; every matrix job must succeed.

## How the pieces fit together

This stack has three layers.

- `agentwallet-sdk` is the engine. It provides wallet operations, spend limits,
  and x402 payment logic. Keys stay with you; the SDK is non-custodial.
- `agentpay-mcp` is the MCP server. It exposes that engine to agent clients
  through MCP tools.
- `agentpay-wallet-starter` is the onboarding lane. It shows how to run both
  together in simulated examples and the optional guarded MCP bridge.

This repo does not replace either package. It makes the relationship easy to run
and easy to understand.

## Choose your path

### Option 1: I want the fastest combined path

Start here.

This repo is for you if you want to:

- run a policy-gated paid-tool example quickly
- understand how the engine and MCP layer fit together
- adapt the example to your own endpoint or policy settings

### Option 2: I only need the engine

Use `agentwallet-sdk` directly.

Choose this if you want to embed wallet, x402, and spend-control logic inside
your own app, backend, or agent runtime.

### Option 3: I only need the MCP server

Use `agentpay-mcp` directly.

Choose this if you already have an MCP-centered workflow and want to expose
wallet-backed payment tools to your client quickly.

## Repo layout

```text
agentpay-wallet-starter/
  README.md
  package.json
  docs/
    quickstart-paid-tool.md
    relationship-guide.md
    choose-your-path.md
  examples/
    controlled-paid-tool/
    coding-agent-bridge/
    bring-your-own-endpoint/
  configs/
    claude_desktop_config.example.json
    cursor_mcp.example.json
    openclaw_mcp.example.json
  scripts/
    setup.js
    verify-starter.js
```

## Success signal

The signal that this repo is working is not a clone alone.

It is this:

- you changed the endpoint, domain, policy rule, or approval threshold
- you reran the example
- you got a result that matches your own use case better than the stock demo

## Read next

- `docs/quickstart-paid-tool.md`
- `docs/relationship-guide.md`
- `docs/choose-your-path.md`
- `docs/policy-example.md`
- `docs/client-setup-claude.md`
- `docs/client-setup-cursor.md`
- `docs/client-setup-openclaw.md`
- `docs/github-metadata.md`
- `docs/remote-publish-checklist.md`
- `examples/bring-your-own-endpoint/README.md`
