# AGENTS.md -- AgentPay Wallet Starter

## Purpose

- This repository is the controlled onboarding path for AgentPay MCP and Agent
  Wallet SDK.
- It proves allowed, approval-required, and blocked payment-policy outcomes in
  simulated mode before any live-money integration.

## Ownership

- AI Agent Economy owns the starter, its examples, and onboarding evidence.

## Local Contracts

- Node.js 20 or newer is required.
- `npm test` is the canonical verification command.
- Default examples must remain no-funds simulations.
- Generated evidence stays under `examples/controlled-paid-tool/artifacts/` and
  remains untracked.
- Live funds, credentials, and production endpoints require a separate human
  checkpoint and are outside this starter's default path.
- `main` is protected by a GitHub ruleset: changes land only through a pull
  request with its required `build` check green and every review thread resolved.
  `build` aggregates `verify (20)`, `verify (22)`, `bridge (22)` and `bridge (24)`;
  all four must pass. Never replace it with a permissive fallback build.
  No direct pushes, force-pushes, or branch deletion.

## Work Guidance

- Keep the first-success path runnable from a clean clone.
- Preserve fail-closed policy behavior and evidence for every scenario.
- Update the README and CI together when the verification command changes.

## Verification

- Run `npm ci` from a clean checkout.
- Run `npm test` on supported Node.js versions.
- For the optional bridge, follow its locked install, typecheck, tests and smoke.

## Child DOX Index

- `examples/coding-agent-bridge/` contains the MCP coding-agent integration.
  Local contract: `examples/coding-agent-bridge/AGENTS.md`.
- `examples/controlled-paid-tool/` owns simulator validation and run evidence.
  Local contract: `examples/controlled-paid-tool/AGENTS.md`.
- `tests/` owns root policy and evidence regressions.
  Local contract: `tests/AGENTS.md`.
