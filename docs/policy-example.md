# Simulator and bridge policy

The dependency-free simulator uses this USD policy shape:

```json
{
  "allowedTools": ["premium_weather_signal"],
  "approvalThresholdUsd": 0.25,
  "hardCapUsd": 1.0
}
```

By default it consumes `examples/controlled-paid-tool/demo.config.json.policy`.
To use `configs/policy.example.json` as the actual policy, pass it explicitly:

```bash
node examples/controlled-paid-tool/run_demo.js allowed --policy configs/policy.example.json
```

`--policy` replaces the embedded policy. `allowedTools` must be an array of exact
tool-name strings; an empty array denies all tools. Amounts and limits must be
finite nonnegative numbers, with approval threshold at or below the hard cap.
Equality with the approval threshold allows; equality with the hard cap requires
approval when above the threshold. Invalid input fails before settlement.

Change the file, rerun with `--policy`, and inspect `latest-run.json.policy` to
verify the effective values. Root `npm test` checks overrides, malformed input,
cap boundaries and approval denial alongside the six scenario evidence checks.

The optional bridge uses a separate host policy:
`examples/coding-agent-bridge/policy.example.json`. It has exact HTTPS endpoint
and recipient allowlists and **decimal USDC strings** for transaction, 24-hour
and approval caps. It installs verified server spend controls before exposing
tools, enforces its own persistent safety budget, and prevents model policy
mutation. The simulator policy is not a bridge or raw AgentPay server config.

Follow [the bridge README](../examples/coding-agent-bridge/README.md) for its
enforced configuration and separate live checkpoint. Approval never overrides
the bridge's caps, and the generic client gateway denies above-threshold calls.
