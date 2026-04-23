# GitHub metadata

## Recommended repo name

`agentpay-wallet-starter`

Why this name won:
- it matches the current local repo scaffold
- it signals that this is the combined starter path, not a new core package
- it keeps `agentpay` visible while still leaving room for the `agentwallet-sdk` engine layer in the docs
- it avoids the vagueness of `agentpay-starter`

## Recommended visibility

Public

Reason:
- this repo is a starter path and onboarding surface
- its value comes from discoverability and easy copying
- the controlled paid-tool lane is already designed as a reviewable proof path

## GitHub description

Starter repo for AgentPay MCP plus Agent Wallet SDK, with a verified controlled paid-tool flow.

## Website

Leave blank for now.

## Suggested topics

- agentpay
- mcp
- agentwallet
- x402
- payments
- claude-desktop
- cursor
- openclaw
- ai-agents
- starter-repo

## First pinned message or repo intro

Start here if you want the shortest path to run `agentpay-mcp` and `agentwallet-sdk` together.

The first proof lane is the controlled paid-tool example. Run `bash scripts/export-check.sh` or `bash scripts/verify-starter.sh`, then adapt the policy and endpoint to your own flow.
