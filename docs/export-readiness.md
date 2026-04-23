# Export readiness

This starter repo is now strong enough for internal review and external packaging work.

## Already true

- root README exists
- relationship guidance exists
- choose-your-path guidance exists
- a validated starter policy example exists at `configs/policy.example.json`
- client setup docs exist for Claude Desktop, Cursor, and OpenClaw
- the controlled paid-tool lane is copied from a validated source example
- repo-level `LICENSE` and `CONTRIBUTING.md` now exist
- `scripts/verify-starter.sh` passes
- `scripts/export-check.sh` exists

## Still worth cleaning before public export

- decide whether the repo name stays `agentpay-wallet-starter` or gets a more explicit public name
- decide whether the coding-agent bridge stays OpenAI-specific or expands to multiple clients later
- decide whether to initialize a standalone git history for export from this workspace copy

## Publish rule

Do not present the coding-agent bridge as the primary proof lane.

The controlled paid-tool example is the first proof path.
The client-specific docs and MCP bridge are next layers.
