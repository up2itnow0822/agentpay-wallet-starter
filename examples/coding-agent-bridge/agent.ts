import { Agent, MCPServerStdio, run } from '@openai/agents';

async function main() {
  const payments = new MCPServerStdio({
    name: 'AgentPay MCP',
    fullCommand: 'npx -y agentpay-mcp',
  });

  await payments.connect();

  try {
    const agent = new Agent({
      name: 'Paid research agent',
      instructions: [
        'You are a careful research agent.',
        'Use MCP payment tools when a premium endpoint requires payment.',
        'Respect the local AGENTS.md policy before making any payment decision.',
        'If a payment exceeds policy, stop and explain why.',
      ].join(' '),
      mcpServers: [payments],
    });

    const result = await run(
      agent,
      'Fetch one premium data point that requires payment, but do not exceed the configured spend limit. Summarize the receipt and the result.',
    );

    console.log(result.finalOutput);
  } finally {
    await payments.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
