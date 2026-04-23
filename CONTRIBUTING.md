# Contributing

Thanks for helping improve `agentpay-wallet-starter`.

## Ground rules

- Keep the engine versus control-surface boundary clear.
- Do not present the starter repo as a merged package.
- Do not claim a runtime integration is supported unless it is actually validated in this repo.
- Keep the controlled paid-tool lane as the first proof path.

## Before you change docs

Check that the docs still match the repo surface:
- `README.md`
- `docs/relationship-guide.md`
- `docs/choose-your-path.md`
- `docs/policy-example.md`
- example READMEs under `examples/`

## Before you change examples

Run:

```bash
bash scripts/verify-starter.sh
```

If you change the controlled paid-tool example, keep the three required outcomes intact:
- allowed
- approval required
- blocked

## Pull request checklist

- explain what changed
- explain whether the change affects the first proof path or a secondary lane
- include the verification command you ran
- avoid broad product claims that are not proven in this repo yet

## Feedback handling

Use the starter feedback issue template for new repo feedback when possible.

When replying, optimize for concrete adaptation signals:
- what the user changed first
- what was unclear
- whether they were blocked on endpoint swapping, client setup, or policy limits
