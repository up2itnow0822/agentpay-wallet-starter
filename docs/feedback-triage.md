# Feedback triage

Use this when new feedback arrives in the repo.

## What to optimize for

The best signal is not praise. It is adaptation.

Look for:
- which part the user changed first
- whether they understand the engine versus MCP boundary
- whether they are blocked on endpoint swapping, client setup, or policy limits

## Priority buckets

### P0: boundary confusion

Examples:
- user thinks this repo is a merged package
- user cannot tell what belongs to `agentwallet-sdk` versus `agentpay-mcp`
- user thinks the coding-agent bridge is the first proof path

Response move:
- reply with the boundary explanation
- point back to `docs/relationship-guide.md`
- consider README tightening if this happens more than once

### P1: endpoint adaptation gap

Examples:
- user wants to swap in a real endpoint and does not know where to start
- user asks for one example that keeps the proof path but changes the endpoint

Response move:
- point to `examples/bring-your-own-endpoint/`
- ask which endpoint they want to swap in
- if the same request repeats, add a more concrete endpoint adaptation example

### P1: client setup gap

Examples:
- user knows the proof path but does not know whether to start in Claude, Cursor, or OpenClaw
- user asks where the client config stops and the wallet layer starts

Response move:
- point to the matching client setup doc
- restate that the client points to the MCP server, while spend controls stay in the wallet-backed layer

### P1: policy limit confusion

Examples:
- user does not understand allow versus approval versus block
- user wants a different threshold shape

Response move:
- point to `configs/policy.example.json` and `docs/policy-example.md`
- ask which threshold they want to change first
- if needed, add another policy example instead of widening claims in the README

### P2: proof path order confusion

Examples:
- user skips the controlled paid-tool example and jumps to the coding-agent bridge
- user asks why the bridge is not the lead path

Response move:
- explain that the controlled example is the shortest proof lane
- only then point to the bridge as the next lane

## What to log

Capture these fields in the existing feedback tracker:
- source surface
- first requested change
- confusion type
- whether the reply led to a concrete next step
- whether a repo artifact should change

## When to change the repo

Change the repo when:
- the same confusion appears more than once
- a missing example blocks a real adaptation attempt
- the README causes the wrong starting move

Do not change the repo just because someone asks for a broader roadmap.
