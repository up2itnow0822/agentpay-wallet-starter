# Cursor setup

Use this after the controlled paid-tool example works.

## Goal

Connect Cursor to `agentpay-mcp` with the same low-risk starter policy.

## Start from

- `configs/cursor_mcp.example.json`

## What to change

Start with the command shape as written:

```json
{
  "mcpServers": {
    "agentpay": {
      "command": "npx",
      "args": ["-y", "agentpay-mcp"]
    }
  }
}
```

Use `configs/policy.example.json` as your starter guardrail model.

Important: this policy file shape is validated in the controlled paid-tool demo in this repo. It is not yet documented here as a direct runtime env contract for the current `agentpay-mcp` server.

## Recommended order

1. Verify the starter lane locally first.
2. Review `configs/policy.example.json` so your allow, approve, and block boundaries are explicit.
3. Add the MCP server to Cursor with tiny wallet limits.
4. Test one paid action that should pass.
5. Test one action that should block or require approval.
6. Record what you changed before raising limits.

## What success looks like

- Cursor can reach the MCP server
- the policy boundary stays intact
- you can adapt the endpoint or spend rule without losing track of the SDK versus MCP boundary

## Common mistake

Do not start by raising limits. Start by proving the reject path still works.
