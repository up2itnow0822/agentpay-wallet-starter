# AGENTS.md — Starter regression tests

## Purpose

- Prove that rejected or unapproved requests cannot reach settlement and that
  reported outcomes agree with receipts and ordered audit evidence.

## Ownership

- Root `tests/` owns dependency-free bridge policy and simulator regressions.
- SDK and MCP protocol integration tests live in the optional bridge package.

## Local Contracts

- Tests run on Node.js 20 and 22 without root runtime dependencies.
- Use temporary directories for adversarial input and injected failure tests.
- Mutation tests operate on temporary simulator copies, never production files.
- No real keys, funded payments, OpenAI API calls or paid endpoint calls.
- Assert forbidden effects and evidence linkage, not just exit codes or labels.

## Work Guidance

- Reproduce a security regression before changing its implementation.
- Exercise approval denial, malformed input, exact cap boundaries, persistent
  budget state and failure after settlement.
- Keep fixtures and mutation anchors honest: a mutation must alter behavior
  and verification must fail through an evidence assertion.

## Verification

- Root `npm test` discovers `*.test.cjs` and `*.test.mjs` and then validates
  the six simulator scenarios.

## Child DOX Index

- No nested contracts.
