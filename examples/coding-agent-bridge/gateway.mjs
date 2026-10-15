import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { validateBridgePolicy } from './security.mjs';

// Register the pinned TypeScript loader without a shell or the tsx CLI's IPC.
await import('tsx/esm');
const { createBridge } = await import('./agent.ts');
const directory = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const mode = process.env.AGENTPAY_MODE ?? 'mock';
  if (!['mock', 'live'].includes(mode)) throw new Error('AGENTPAY_MODE must be mock or live.');
  if (mode === 'live' && (process.env.AGENTPAY_OPERATOR_ACK !== 'reviewed-policy-and-wallet' || !process.env.AGENTPAY_POLICY_PATH)) {
    throw new Error('Live gateway requires a separately reviewed wallet and policy, AGENTPAY_POLICY_PATH and AGENTPAY_OPERATOR_ACK=reviewed-policy-and-wallet.');
  }
  const policyPath = mode === 'live' ? path.resolve(process.env.AGENTPAY_POLICY_PATH) : path.join(directory, 'policy.example.json');
  const policy = validateBridgePolicy(JSON.parse(fs.readFileSync(policyPath, 'utf8')));
  const auditDir = mode === 'mock' && process.env.AGENTPAY_MOCK_AUDIT_DIR
    ? path.resolve(process.env.AGENTPAY_MOCK_AUDIT_DIR)
    : path.resolve(directory, '../controlled-paid-tool/artifacts', mode === 'mock' ? 'bridge-gateway-mock' : 'bridge');
  // Stdio is the MCP transport, not an approval terminal. Larger requests deny.
  const bridge = await createBridge({ mode, policy, auditDir, approve: async () => false });
  const gateway = new Server({ name: 'AgentPay guarded starter gateway', version: '1.0.0' }, { capabilities: { tools: {} } });
  gateway.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: (await bridge.server.listTools()).map(tool => tool.name === 'x402_pay'
    ? { ...tool, description: `${tool.description} Gateway requests above the ${policy.approvalThresholdUsdc} USDC approval threshold are always denied; stdio provides no approval prompt.` }
    : tool) }));
  gateway.setRequestHandler(CallToolRequestSchema, async request => {
    const result = await bridge.server.callToolResult(request.params.name, request.params.arguments ?? {});
    return { content: result.content.filter(item => item.type === 'text'), isError: result.isError === true };
  });
  gateway.onclose = () => { void bridge.close(); };
  try { await gateway.connect(new StdioServerTransport()); }
  catch (error) { await bridge.close(); throw error; }
}

main().catch(() => { console.error('Guarded gateway startup failed. Check the local configuration; live mode requires an explicit operator checkpoint.'); process.exitCode = 1; });
