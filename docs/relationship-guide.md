# Relationship guide

## The short version

- `agentwallet-sdk` is the engine
- `agentpay-mcp` is the MCP server on top of it
- `agentpay-wallet-starter` is the quickest way to use both together

## What each layer owns

### Agent Wallet SDK

Use `agentwallet-sdk` when you want:
- wallet operations in your own app or runtime
- spend controls inside your own codebase
- x402 payment logic without an MCP layer

### AgentPay MCP

Use `agentpay-mcp` when you want:
- MCP tools that agent clients can call
- a server surface for Claude, Cursor, OpenClaw, Codex, or another MCP client
- wallet-backed payment actions exposed through MCP

### agentpay-wallet-starter

Use this repo when you want:
- the fastest combined path
- one first-run example that makes the boundary obvious
- a place to adapt endpoint and policy behavior before deeper integration

## What not to confuse

Do not treat:
- the starter repo as a merged package
- the MCP server as a separate wallet engine
- the combined path as mandatory for every user

## The reason this repo exists

The package boundary is correct, but it still creates onboarding friction for first-time users.

This repo fixes that by giving users one place to:
- run a working first flow
- understand the engine versus control-surface boundary
- choose the right next path for their own use case
