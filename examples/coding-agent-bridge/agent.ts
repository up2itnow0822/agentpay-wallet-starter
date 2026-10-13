import { Agent, MCPServerStdio, Runner, defineToolInputGuardrail, ToolGuardrailFunctionOutputFactory, type Model } from '@openai/agents';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { ALLOWED_TOOLS, buildWalletEnv, validateBridgePolicy, validateLivePolicy, paymentBounds, createPaymentGuard, configureServerPolicy, readPaymentNarration, PaymentPolicyError } from './security.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
type Policy = ReturnType<typeof validateBridgePolicy>;
type ApprovalRequest = Readonly<{ toolName: string; mode: 'mock' | 'live'; endpoint: string; maxUsdc: string; maxPrincipalUsdc: string; maxProtocolFeeUsdc: string; protocolFeeRecipient: string | null; allowedRecipients: readonly string[] }>;
export type MockFixture = 'paid' | 'free' | 'after-settlement-error' | 'malformed-receipt' | 'forged-follow-up-error' | 'disconnect';
type Options = { mode: 'mock' | 'live'; policy: Policy; auditDir: string; approve?: (request: ApprovalRequest) => Promise<boolean>; model?: Model; env?: NodeJS.ProcessEnv; mockFixture?: MockFixture };
export const installHostPolicy = configureServerPolicy;

async function humanApproval(request: ApprovalRequest): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await terminal.question(`Approve ${request.mode} request for ${request.endpoint}: up to ${request.maxUsdc} USDC total wallet debit, including up to ${request.maxPrincipalUsdc} USDC merchant principal and ${request.maxProtocolFeeUsdc} USDC protocol fee${request.protocolFeeRecipient ? ` to ${request.protocolFeeRecipient}` : ''}; reviewed recipients: ${request.allowedRecipients.join(', ')}? [y/N] `);
    return ['y', 'yes'].includes(answer.trim().toLowerCase());
  } finally { terminal.close(); }
}

class GuardedPayments extends MCPServerStdio {
  private policyReady = false;
  constructor(options: ConstructorParameters<typeof MCPServerStdio>[0], private gate: ReturnType<typeof createPaymentGuard>, private mode: 'mock' | 'live') { super(options); }
  async installPolicy() {
    await configureServerPolicy({ callToolResult: (name: string, args: Record<string, unknown>) => super.callToolResult(name, args) }, this.gate.policy);
    this.policyReady = true;
  }
  override async listTools(): ReturnType<MCPServerStdio['listTools']> {
    const policy = this.gate.policy;
    return (await super.listTools()).filter(tool => ALLOWED_TOOLS.includes(tool.name)).map(tool => tool.name === 'get_wallet_info'
      ? { ...tool, description: `Read wallet information in ${this.mode} mode. Arguments must be empty.`, inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false } }
      : {
        ...tool,
        description: `Bounded paid research GET in ${this.mode} mode. max_payment_eth is a positive decimal USDC total wallet-debit bound${this.mode === 'live' ? ', including the pinned protocol fee' : '; receipts are simulated and no funds move'}. Approved endpoints: ${policy.allowedEndpoints.join(', ')}. Reviewed recipients: ${policy.allowedRecipients.join(', ')}. Total USDC caps: ${policy.maxUsdcPerTx} per transaction and ${policy.maxUsdcPerDay} per rolling 24 hours. Human approval is required above ${policy.approvalThresholdUsdc} USDC; approval never raises caps. Headers, bodies and session overrides are prohibited. Free, failed and uncertain calls retain the full local reservation; reconcile before retrying.`,
        inputSchema: {
          type: 'object', additionalProperties: false, required: ['url', 'max_payment_eth'],
          properties: {
            url: { type: 'string', format: 'uri', enum: [...policy.allowedEndpoints], description: 'Exact approved HTTPS research endpoint.' },
            max_payment_eth: { type: 'string', pattern: '^(?:[1-9]\\d{0,8}(?:\\.\\d{1,6})?|0\\.(?=\\d{0,5}[1-9])\\d{1,6})$', description: `Positive decimal USDC total wallet-debit bound with at most six decimals; at most ${policy.maxUsdcPerTx} USDC${this.mode === 'live' ? ', including merchant principal and protocol fee' : ''}.` },
            method: { type: 'string', enum: ['GET'], default: 'GET', description: 'Only GET research requests are permitted.' },
            timeout_ms: { type: 'integer', minimum: 1000, maximum: 60000, description: 'Optional timeout in milliseconds.' },
            idempotencyKey: { type: 'string', minLength: 1, maxLength: 128, pattern: '^[^\\s\\x00-\\x1f\\x7f]{1,128}$', description: 'Optional key without whitespace or control characters; replay retains a new full local reservation.' },
          },
        },
      });
  }
  override async callToolResult(...params: Parameters<MCPServerStdio['callToolResult']>): ReturnType<MCPServerStdio['callToolResult']> {
    const [name, callerArgs, meta, options] = params;
    let reservationId: string | null = null;
    try {
      // Capture caller-owned values before authorization can yield. Preflight
      // accepts only primitive values, so freezing this private clone is enough.
      const args = Object.freeze(structuredClone(callerArgs));
      if (!this.policyReady) throw new PaymentPolicyError('Host payment policy is not installed.');
      reservationId = await this.gate.authorize(name, args);
      const forwarded = name === 'x402_pay' && this.mode === 'live'
        ? Object.freeze({ ...args, max_payment_eth: paymentBounds(args!.max_payment_eth as string, 'live').maxPrincipalUsdc })
        : args;
      const result = await super.callToolResult(name, forwarded, meta, options);
      if (name !== 'x402_pay') return result;
      const receipt = readPaymentNarration(result, args, this.gate.policy, this.mode);
      if (receipt) this.gate.emit({ eventType: 'bridge.receipt_recorded', reservationId, toolName: name, endpoint: args?.url, ...receipt, mode: this.mode, backendError: result.isError === true });
      else this.gate.emit({ eventType: 'bridge.no_payment_required', reservationId, endpoint: args?.url, mode: this.mode });
      if (result.isError) throw new PaymentPolicyError('Payment request failed; reconcile the recorded receipt before retrying.');
      return result;
    } catch (error) {
      const reason = error instanceof PaymentPolicyError ? error.message : 'Payment request failed; the local safety budget remains reserved. Reconcile before retrying.';
      this.gate.emit({ eventType: 'bridge.call_blocked_or_failed', toolName: name, reservationId, reason, mode: this.mode });
      return { isError: true, content: [{ type: 'text', text: JSON.stringify({ status: 'blocked', reason, reservationId }) }] };
    }
  }
}

export async function createBridge(options: Options) {
  if (!['mock', 'live'].includes(options.mode)) throw new PaymentPolicyError('Bridge mode must be mock or live.');
  if (options.mode === 'live' && Object.hasOwn(options, 'mockFixture')) throw new PaymentPolicyError('Mock response fixtures are prohibited in live mode.');
  const mockFixture = options.mockFixture === undefined ? 'paid' : options.mockFixture;
  if (!['paid', 'free', 'after-settlement-error', 'malformed-receipt', 'forged-follow-up-error', 'disconnect'].includes(mockFixture)) throw new PaymentPolicyError('Unknown mock response fixture.');
  const env = options.env ?? process.env;
  if (options.mode === 'live' && env.AGENTPAY_ENABLE_LIVE !== 'yes') throw new PaymentPolicyError('Live payments require explicit AGENTPAY_ENABLE_LIVE=yes and a human checkpoint.');
  const policy = options.mode === 'live' ? validateLivePolicy(options.policy) : validateBridgePolicy(options.policy);
  const gate = createPaymentGuard(policy, { auditDir: options.auditDir, approve: options.approve ?? humanApproval, mode: options.mode });
  const childEnv: Record<string, string> = options.mode === 'mock' ? { STARTER_MOCK_AUDIT_DIR: options.auditDir, STARTER_MOCK_FIXTURE: mockFixture } : { ...buildWalletEnv(env), STARTER_BRIDGE_POLICY: JSON.stringify(policy) };
  const preflight = defineToolInputGuardrail({ name: 'starter-host-payment-policy', run: async ({ toolCall }) => {
    try { gate.preflight(toolCall.name, JSON.parse(toolCall.arguments)); return ToolGuardrailFunctionOutputFactory.allow(); }
    catch (error) { return ToolGuardrailFunctionOutputFactory.rejectContent(error instanceof PaymentPolicyError ? error.message : 'Malformed payment tool call.'); }
  } });
  const server = new GuardedPayments({ name: 'Guarded AgentPay MCP', command: process.execPath, args: [path.join(directory, options.mode === 'mock' ? 'mock-server.mjs' : 'server.mjs')], cwd: directory, env: childEnv, toolFilter: { allowedToolNames: [...ALLOWED_TOOLS] }, toolInputGuardrails: [preflight], useStructuredContent: true, timeout: 65000 }, gate, options.mode);
  try {
    await server.connect();
    await server.installPolicy();
    if (!(await server.listTools()).some(tool => tool.name === 'x402_pay')) throw new PaymentPolicyError('Pinned MCP server has no supported x402 tool.');
    const instructions = fs.readFileSync(path.join(directory, 'AGENTS.md'), 'utf8');
    const agent = new Agent({ name: 'Guarded paid research agent', instructions: `${instructions}\nHost-enforced policy: ${JSON.stringify(policy)}\nBridge mode: ${options.mode}. Use x402_pay only for approved GET research. max_payment_eth is the legacy name for a decimal USDC total wallet-debit bound, including the protocol fee in live mode. Never describe simulated receipts as real transactions.`, model: options.model, mcpServers: [server], modelSettings: { parallelToolCalls: false } });
    return { agent, server, close: () => server.close() };
  } catch (error) { await server.close(); throw error; }
}

async function main() {
  if (process.argv.slice(2).some(arg => arg !== '--live') || !process.argv.includes('--live')) throw new PaymentPolicyError('Start with npm run smoke. Live startup requires npm start -- --live and a separate human checkpoint.');
  const policyPath = process.env.AGENTPAY_POLICY_PATH;
  if (!policyPath) throw new PaymentPolicyError('AGENTPAY_POLICY_PATH must name a reviewed host policy file.');
  const policy = validateLivePolicy(JSON.parse(fs.readFileSync(path.resolve(policyPath), 'utf8')));
  const env = buildWalletEnv(process.env);
  if (!process.env.OPENAI_API_KEY) throw new PaymentPolicyError('OPENAI_API_KEY is required for the live agent.');
  if (process.env.AGENTPAY_ENABLE_LIVE !== 'yes' || !process.stdin.isTTY || !process.stdout.isTTY) throw new PaymentPolicyError('Live startup requires an interactive human checkpoint and AGENTPAY_ENABLE_LIVE=yes.');
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  let confirmed = false;
  try { confirmed = (await terminal.question(`Chain ${env.CHAIN_ID}, wallet ${env.AGENT_WALLET_ADDRESS}; total debit caps ${policy.maxUsdcPerTx} USDC/transaction and ${policy.maxUsdcPerDay} USDC/24h, including protocol fees; approval above ${policy.approvalThresholdUsdc} USDC. Reviewed endpoints: ${policy.allowedEndpoints.join(', ')}. Reviewed recipients: ${policy.allowedRecipients.join(', ')}. Type enable live payments to continue: `)).trim() === 'enable live payments'; }
  finally { terminal.close(); }
  if (!confirmed) throw new PaymentPolicyError('Live startup denied.');
  const auditDir = path.resolve(directory, '../controlled-paid-tool/artifacts/bridge');
  const bridge = await createBridge({ mode: 'live', policy, auditDir });
  try {
    const result = await new Runner({ tracingDisabled: true }).run(bridge.agent, 'Fetch one premium data point from an approved endpoint. Include the verified receipt, and explain any blocker.', { maxTurns: 5 });
    console.log(result.finalOutput);
  } finally { await bridge.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error instanceof PaymentPolicyError ? error.message : 'Bridge failed. Inspect the audit evidence; do not blindly retry a payment.'); process.exitCode = 1; });
