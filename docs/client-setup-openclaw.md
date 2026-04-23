# OpenClaw setup

Use this after the controlled paid-tool example works.

## Goal

Register `agentpay-mcp` as an MCP server in OpenClaw without blurring where the payment policy lives.

## Start from

- `configs/openclaw_mcp.example.json`

## Example shape

```json
{
  "name": "agentpay",
  "command": "npx",
  "args": ["-y", "agentpay-mcp"]
}
```

Use `configs/policy.example.json` as your starter guardrail model.

Important: this policy file shape is validated in the controlled paid-tool demo in this repo. It is not yet documented here as a direct runtime env contract for the current `agentpay-mcp` server.

## Recommended order

1. Verify the starter lane locally.
2. Register the MCP server in OpenClaw.
3. Review `configs/policy.example.json` so your allow, approve, and block boundaries are explicit.
4. Keep wallet limits on a low-risk profile.
5. Test one allowed path and one blocked or approval path.
6. Move to a real paid endpoint only after both behaviors are visible.

## What success looks like

- OpenClaw can invoke the MCP server
- the spend limits and approval boundary stay explicit
- you can trace the flow from client to MCP server to wallet-backed payment layer

## Common mistake

Do not assume OpenClaw owns the money boundary. It owns the client side. The actual payment boundary still sits behind the MCP layer in the wallet flow and spend limits you configure.
