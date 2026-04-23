# Bring your own endpoint

Use this lane after the controlled paid-tool demo works.

Goal:
- keep the same engine versus MCP boundary
- swap in your own endpoint or domain
- keep the same habit of proving one allowed path and one blocked or approval path

## Start from

- `../controlled-paid-tool/demo.config.json`
- `../coding-agent-bridge/agent.ts` if you want an MCP client shape

## First adaptation checklist

1. name the endpoint you actually want to call
2. define the spend limit that should allow the normal path
3. define the threshold that should block or require approval
4. rerun the flow
5. write down what changed and why

## Minimum proof

Your first adaptation is good enough when you can show:
- one request that should pass
- one request that should stop or require approval
- the exact config or policy field you changed to get that behavior
