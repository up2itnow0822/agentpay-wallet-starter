# AGENTS.md — Controlled paid-tool simulator

## Purpose

- Provide the dependency-free first-success path with simulated USD challenges,
  executable policy, exact approval and local audit evidence.

## Ownership

- This directory owns the runner, configuration, policy, simulator and verifier.
- Root `tests/` owns invalid input, fault injection and mutation regressions.

## Local Contracts

- Validate finite nonnegative numeric amounts, ordered policy thresholds,
  string-array allowlists and scenario input before requesting a challenge.
- Require own scenario properties; inherited object names must never run.
- Only USD and `simulated-x402` are supported. Default execution moves no funds.
- The embedded config policy is authoritative unless `--policy` explicitly
  overrides it. Unknown, duplicate or incomplete flags fail closed.
- Only boolean true permits required approval; terminal responses accept exact
  y/yes. Noninteractive approval defaults to deny. Environment auto-approval is
  a simulator convenience only and never applies to the MCP bridge.
- Blocked or denied runs have no settlement receipt or tool result.
- Persist challenge, policy, approval, receipt and result linked by run ID.
- Failures write `run.failed` and a failed per-run/latest summary, preserving
  any receipt already obtained. Evidence I/O failures exit unsuccessfully and
  must never trigger another settlement attempt.
- Generated artifacts stay in this directory's ignored `artifacts/` subtree.

## Work Guidance

- Keep exported runner seams for local fault injection without production
  environment flags that disable safety checks.
- Preserve atomic summary replacement and meaningful evidence assertions.
- Update the root README and CI with changes to canonical verification.

## Verification

- Root `npm test` runs regression and mutation tests plus the scenario verifier.
- `node validate_demo.js` verifies allowed, approved, blocked, denied, unset
  approval and unrecognized approval with ordered audit and receipt assertions.

## Child DOX Index

- `lib/` inherits this contract.
