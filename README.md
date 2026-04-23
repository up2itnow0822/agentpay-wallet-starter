# agentpay-wallet-starter

AgentPay MCP plus Agent Wallet SDK, one clear starter path.

`agentpay-wallet-starter` shows how to use `agentwallet-sdk` and `agentpay-mcp` together in one real paid-tool flow.

Use this repo when you want the fastest path to first success with both pieces of the stack:
- `agentwallet-sdk` handles wallet custody, spend controls, and x402 payment logic
- `agentpay-mcp` exposes that capability to Claude, Cursor, OpenClaw, Codex, and other MCP clients
- this repo gives you the shortest path to run them together, then adapt the flow to your own endpoint or policy rules

If you only need one side of the stack, go straight to that package:
- use `agentwallet-sdk` if you want library-level control inside your own app or runtime
- use `agentpay-mcp` if you already know you want an MCP server surface
- use this repo if you want the combined path without figuring out the relationship from scratch

## What works today

This scaffold already includes one runnable first-success lane:
- `examples/controlled-paid-tool/` copied from the real AgentPay MCP example surface
- `scripts/verify-starter.sh` to validate allowed, approval, and blocked outcomes

It also includes two next lanes:
- `examples/coding-agent-bridge/` for an MCP client flow
- `examples/bring-your-own-endpoint/` for your first adaptation pass

## Quick start

```bash
bash scripts/verify-starter.sh
node examples/controlled-paid-tool/run_demo.js allowed
NEMOCLAW_AUTO_APPROVE=yes node examples/controlled-paid-tool/run_demo.js approval
node examples/controlled-paid-tool/run_demo.js blocked
```

Then adapt the path:
- change policy values in `examples/controlled-paid-tool/demo.config.json`
- rerun the scenario that matches your use case
- record what changed and why

## How the pieces fit together

This stack has three layers.

- `agentwallet-sdk` is the engine. It owns wallet operations, spend limits, and x402 payment logic.
- `agentpay-mcp` is the MCP server. It exposes that engine to agent clients through MCP tools.
- `agentpay-wallet-starter` is the onboarding lane. It shows how to run both together in real example flows.

This repo does not replace either package. It makes the relationship easy to run and easy to understand.

## Choose your path

### Option 1: I want the fastest combined path
Start here.

This repo is for you if you want to:
- run a policy-gated paid-tool example quickly
- understand how the engine and MCP layer fit together
- adapt the example to your own endpoint or policy settings

### Option 2: I only need the engine
Use `agentwallet-sdk` directly.

Choose this if you want to embed wallet, x402, and spend-control logic inside your own app, backend, or agent runtime.

### Option 3: I only need the MCP server
Use `agentpay-mcp` directly.

Choose this if you already have an MCP-centered workflow and want to expose wallet-backed payment tools to your client quickly.

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
    setup.sh
    verify-starter.sh
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
- `examples/bring-your-own-endpoint/README.md`
