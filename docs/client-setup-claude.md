# Claude Desktop setup

Use this after the controlled paid-tool example works.

## Goal

Connect Claude Desktop to `agentpay-mcp` with a clear policy path.

## Start from

- `configs/claude_desktop_config.example.json`

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

1. Run `bash scripts/verify-starter.sh` first.
2. Review `configs/policy.example.json` so your allow, approve, and block boundaries are explicit.
3. Start with low spend caps when you create the wallet or set spend limits through the MCP tools.
4. Confirm one allowed path and one blocked or approval path.
5. Only then point Claude Desktop at your real paid endpoint flow.

## What success looks like

- Claude can see the MCP server
- paid actions stay inside your policy boundary
- you can explain which part comes from the MCP server and which part comes from the wallet engine

## Common mistake

Do not treat the Claude config as the source of payment policy. The client config only points to the MCP server. The payment boundary still belongs to the wallet-backed layer and the spend limits you enforce through the wallet flow.
