# OpenClaw setup

Run root `npm test` first. Then install and verify the guarded MCP bridge:

```bash
cd examples/coding-agent-bridge
npm ci --ignore-scripts
npm run typecheck
npm test
npm run smoke
```

Use Node.js 22.12+. Copy `configs/openclaw_mcp.example.json` into your
OpenClaw MCP configuration and replace the absolute path placeholder with your
checkout's `gateway.mjs` path. Use an absolute Node executable path as well if
your client cannot find `node` in PATH.

```json
{
  "name": "agentpay",
  "command": "node",
  "args": [
    "/ABSOLUTE/PATH/agentpay-wallet-starter/examples/coding-agent-bridge/gateway.mjs"
  ]
}
```

The gateway defaults to a no-funds mock. It exposes only `get_wallet_info` and
`x402_pay`, with exact endpoint and payee allowlists, caps and a persistent local
budget. Ask for a simulated request to `https://merchant.example/paid-weather`
with `max_payment_eth` set to `"0.18"`; then verify that an unknown endpoint or
`"0.65"` request is blocked. The stdio gateway denies above-threshold payments
because model messages cannot supply human approval.

For any live use, follow the separate operator checkpoint and environment
contract in [the bridge README](../examples/coding-agent-bridge/README.md).
Replace the mock merchant/payee and review wallet limits first. Do not put keys
in tracked client configs. All clients using the same live wallet must share the
persistent audit/budget directory.

`configs/policy.example.json` belongs to the USD simulator and is consumed only
with its `--policy` flag. The bridge uses its own `policy.example.json` shape and
USDC strings; client registration alone does not configure payment policy.
