import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Runner, Usage, type Model, type ModelRequest, type ModelResponse, type StreamEvent } from '@openai/agents';
import { X402_PROTOCOL_FEE_COLLECTOR } from './security.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
async function bridgeModule() {
  assert.match(fs.readFileSync(path.join(directory, 'agent.ts'), 'utf8'), /export async function createBridge/, 'An enforced, independently testable bridge factory is required.');
  return import('./agent.js');
}
const endpoint = 'https://merchant.example/paid-weather';
const recipient = `0x${'1'.repeat(40)}`;
const policy = { allowedEndpoints: [endpoint], allowedRecipients: [recipient], maxUsdcPerTx: '1', maxUsdcPerDay: '5', approvalThresholdUsdc: '0.25' };
const livePolicy = { ...policy, allowedRecipients: [recipient, X402_PROTOCOL_FEE_COLLECTOR] };
const syntheticLiveEnv = { AGENTPAY_ENABLE_LIVE: 'yes', AGENT_PRIVATE_KEY: `0x${'2'.repeat(64)}`, AGENT_WALLET_ADDRESS: recipient, CHAIN_ID: '84532', RPC_URL: 'https://rpc.invalid.example' };

function assertToolContract(tools: Awaited<ReturnType<import('@openai/agents').MCPServerStdio['listTools']>>, mode: 'mock' | 'live', recipients: string[]) {
  assert.deepEqual(tools.map(tool => tool.name).sort(), ['get_wallet_info', 'x402_pay']);
  assert.deepEqual(tools.find(tool => tool.name === 'get_wallet_info')!.inputSchema, { type: 'object', properties: {}, required: [], additionalProperties: false });
  const payment = tools.find(tool => tool.name === 'x402_pay')!;
  const schema = payment.inputSchema as { required: string[]; additionalProperties: boolean; properties: Record<string, any> };
  assert.deepEqual(schema.required, ['url', 'max_payment_eth']);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties).sort(), ['idempotencyKey', 'max_payment_eth', 'method', 'timeout_ms', 'url']);
  assert.deepEqual(schema.properties.url.enum, [endpoint]);
  assert.equal(schema.properties.max_payment_eth.type, 'string');
  assert.match(schema.properties.max_payment_eth.description, /USDC.*total|total.*USDC/i);
  const decimal = new RegExp(schema.properties.max_payment_eth.pattern);
  assert.equal(decimal.test('0.18'), true);
  for (const invalid of ['0', '0.000000', '1e-3', '0.1234567', '01', '-1']) assert.equal(decimal.test(invalid), false, invalid);
  assert.deepEqual(schema.properties.method.enum, ['GET']);
  assert.equal(schema.properties.timeout_ms.type, 'integer');
  assert.equal(schema.properties.timeout_ms.minimum, 1000);
  assert.equal(schema.properties.timeout_ms.maximum, 60000);
  assert.equal(schema.properties.idempotencyKey.type, 'string');
  assert.equal(schema.properties.idempotencyKey.minLength, 1);
  assert.equal(schema.properties.idempotencyKey.maxLength, 128);
  const idempotency = new RegExp(schema.properties.idempotencyKey.pattern);
  for (const invalid of ['', 'space key', '\nkey', `key\x7f`, 'x'.repeat(129)]) assert.equal(idempotency.test(invalid), false);
  for (const value of [mode, endpoint, ...recipients.map(value => value.toLowerCase()), policy.maxUsdcPerTx, policy.maxUsdcPerDay, policy.approvalThresholdUsdc]) assert(payment.description!.includes(value), value);
}

class ToolModel implements Model {
  calls = 0;
  discovered: string[] = [];
  constructor(private args: Record<string, unknown>) {}
  async getResponse(request: ModelRequest): Promise<ModelResponse> {
    this.discovered = request.tools.map(t => t.name);
    this.calls++;
    return { usage: new Usage(), output: this.calls === 1
      ? [{ type: 'function_call', callId: 'test-call', name: 'x402_pay', arguments: JSON.stringify(this.args) }]
      : [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Simulated guarded tool flow completed.' }] }]
    };
  }
  async *getStreamedResponse(): AsyncIterable<StreamEvent> { throw new Error('Streaming is not used by this smoke test.'); }
}

async function setup(t: test.TestContext, args: Record<string, unknown>, approve: (request: unknown) => Promise<boolean> = async () => true) {
  const module = await bridgeModule();
  const auditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'starter-sdk-bridge-'));
  t.after(() => fs.rmSync(auditDir, { recursive: true, force: true }));
  const model = new ToolModel(args);
  const bridge = await module.createBridge({ mode: 'mock', policy, auditDir, approve, model });
  t.after(() => bridge.close());
  const runner = new Runner({ tracingDisabled: true });
  return { bridge, model, runner, auditDir };
}

test('actual SDK executes an allowed call with a local stdio MCP server', async t => {
  const { bridge, model, runner, auditDir } = await setup(t, { url: endpoint, max_payment_eth: '0.18' });
  const result = await runner.run(bridge.agent, 'Run the guarded paid research tool.', { maxTurns: 3 });
  assert.match(String(result.finalOutput), /Simulated/);
  assert.deepEqual(model.discovered.sort(), ['get_wallet_info', 'x402_pay']);
  const events = fs.readFileSync(path.join(auditDir, 'bridge-audit.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert(events.some(e => e.eventType === 'bridge.payment_reserved'));
  assert(events.some(e => e.eventType === 'bridge.receipt_recorded' && e.receiptId && e.payee === recipient && e.amountAtomic === '180000'));
});

test('mock adapter advertises only the guarded schemas and reviewed policy', async t => {
  const { bridge } = await setup(t, { url: endpoint, max_payment_eth: '0.18' });
  assertToolContract(await bridge.server.listTools(), 'mock', [recipient]);
});

test('SDK input guard prevents unknown endpoints reaching the MCP server', async t => {
  const { bridge, runner, auditDir } = await setup(t, { url: 'https://evil.example/data', max_payment_eth: '0.18' });
  await runner.run(bridge.agent, 'Try the tool.', { maxTurns: 3 });
  assert.equal(fs.existsSync(path.join(auditDir, 'mock-paid-calls.jsonl')), false);
  assert.equal(fs.existsSync(path.join(auditDir, 'bridge-budget.json')), false);
});

test('denied approval never reaches the MCP payment sink', async t => {
  const { bridge, runner, auditDir } = await setup(t, { url: endpoint, max_payment_eth: '0.65' }, async () => false);
  await runner.run(bridge.agent, 'Try the tool.', { maxTurns: 3 });
  assert.equal(fs.existsSync(path.join(auditDir, 'mock-paid-calls.jsonl')), false);
  assert.equal(fs.existsSync(path.join(auditDir, 'bridge-budget.json')), false);
});

test('direct MCP calls cannot bypass the model input guard or change policy', async t => {
  const { bridge, auditDir } = await setup(t, { url: endpoint, max_payment_eth: '0.18' });
  const result = await bridge.server.callToolResult('set_spend_policy', { dailyLimitEth: '999' });
  assert.equal(result.isError, true);
  assert.equal(fs.existsSync(path.join(auditDir, 'mock-paid-calls.jsonl')), false);
});

test('direct adapter snapshots caller URL and total bound before yielding', async t => {
  let approvals = 0;
  const original = { url: endpoint, max_payment_eth: '0.18' };
  const { bridge, auditDir } = await setup(t, original, async () => { approvals++; return false; });
  const pending = bridge.server.callToolResult('x402_pay', original);
  original.url = 'https://evil.example/data';
  original.max_payment_eth = '0.65';
  const result = await pending;
  assert.notEqual(result.isError, true);
  assert.equal(approvals, 0);
  const calls = fs.readFileSync(path.join(auditDir, 'mock-paid-calls.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(calls, [{ url: endpoint, max_payment_eth: '0.18' }]);
  const state = JSON.parse(fs.readFileSync(path.join(auditDir, 'bridge-budget.json'), 'utf8'));
  assert.deepEqual(state.entries.map((entry: { micros: string }) => entry.micros), ['180000']);
  const events = fs.readFileSync(path.join(auditDir, 'bridge-audit.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  for (const event of events.filter(event => ['bridge.payment_requested', 'bridge.payment_reserved', 'bridge.receipt_recorded'].includes(event.eventType))) assert.equal(event.endpoint, endpoint);
  assert.equal(events.find(event => event.eventType === 'bridge.payment_reserved').maxUsdc, '0.18');
  assert.equal(events.find(event => event.eventType === 'bridge.receipt_recorded').amountAtomic, '180000');
});

test('mutating a pending request cannot replace denied approval or reach the sink', async t => {
  const requests: Array<{ endpoint: string; maxUsdc: string }> = [];
  const original = { url: endpoint, max_payment_eth: '0.65' };
  const { bridge, auditDir } = await setup(t, original, async request => {
    requests.push(request as { endpoint: string; maxUsdc: string });
    await Promise.resolve();
    return false;
  });
  const pending = bridge.server.callToolResult('x402_pay', original);
  original.url = 'https://evil.example/data';
  original.max_payment_eth = '0.18';
  assert.equal((await pending).isError, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].endpoint, endpoint);
  assert.equal(requests[0].maxUsdc, '0.65');
  assert.equal(fs.existsSync(path.join(auditDir, 'mock-paid-calls.jsonl')), false);
  assert.equal(fs.existsSync(path.join(auditDir, 'bridge-budget.json')), false);
});

test('raw pinned AgentPay server installs host policy without funds', async () => {
  const module = await bridgeModule();
  const { MCPServerStdio } = await import('@openai/agents');
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const raw = new MCPServerStdio({ name: 'AgentPay pinned configuration smoke', command: process.execPath, args: [require.resolve('agentpay-mcp')], env: {} });
  try {
    await raw.connect();
    await module.installHostPolicy(raw, policy);
    const tools = await raw.listTools();
    assert(tools.some(t => t.name === 'x402_pay'));
    assert(tools.some(t => t.name === 'set_spend_policy'));
  } finally { await raw.close(); }
});

test('live adapter rejects missing opt-in before starting a child', async t => {
  const module = await bridgeModule();
  const auditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'starter-sdk-no-opt-in-'));
  t.after(() => fs.rmSync(auditDir, { recursive: true, force: true }));
  await assert.rejects(module.createBridge({ mode: 'live', policy, auditDir, env: {} }), /AGENTPAY_ENABLE_LIVE/);
});

test('constrained pinned server starts with synthetic credentials and installs policy without a network call', async t => {
  const module = await bridgeModule();
  const auditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'starter-sdk-pinned-bootstrap-'));
  t.after(() => fs.rmSync(auditDir, { recursive: true, force: true }));
  const bridge = await module.createBridge({ mode: 'live', policy: livePolicy, auditDir, env: syntheticLiveEnv });
  t.after(() => bridge.close());
  assertToolContract(await bridge.server.listTools(), 'live', livePolicy.allowedRecipients);
  const denied = await bridge.server.callToolResult('x402_pay', { url: 'https://evil.example/data', max_payment_eth: '0.18' });
  assert.equal(denied.isError, true);
  assert.equal(fs.existsSync(path.join(auditDir, 'bridge-budget.json')), false);
});

test('live adapter requires the reviewed fee collector before starting a child', async t => {
  const module = await bridgeModule();
  const auditDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'starter-sdk-missing-fee-')), 'not-created');
  t.after(() => fs.rmSync(path.dirname(auditDir), { recursive: true, force: true }));
  await assert.rejects(module.createBridge({ mode: 'live', policy, auditDir, env: syntheticLiveEnv }), /fee collector/);
  assert.equal(fs.existsSync(auditDir), false);
});

test('live adapter reserves the total bound and forwards only the fee-adjusted principal', async t => {
  const module = await bridgeModule();
  const { MCPServerStdio } = await import('@openai/agents');
  const auditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'starter-sdk-total-bound-'));
  t.after(() => fs.rmSync(auditDir, { recursive: true, force: true }));
  const approvals: Array<Record<string, unknown>> = [];
  const bridge = await module.createBridge({ mode: 'live', policy: livePolicy, auditDir, env: syntheticLiveEnv, approve: async request => { approvals.push(request); await Promise.resolve(); return true; } });
  t.after(() => bridge.close());
  // Replace only external payment I/O. Startup used the actual pinned server;
  // no request reaches the synthetic RPC endpoint or a funded wallet.
  const originalCall = MCPServerStdio.prototype.callToolResult;
  const forwarded: Array<Record<string, unknown> | null> = [];
  MCPServerStdio.prototype.callToolResult = async function(name, args, ...rest) {
    if (name !== 'x402_pay') return originalCall.call(this, name, args, ...rest);
    forwarded.push(args);
    return { content: [{ type: 'text', text: `🌐 **x402 Fetch Result**\n\nPayment Made\n  Amount:    992359 (base units)\n  Recipient: ${recipient}\n  TX Hash:   0x${'3'.repeat(64)}\n\nResponse Body\nNo-funds receipt fixture.` }] };
  };
  t.after(() => { MCPServerStdio.prototype.callToolResult = originalCall; });
  const args = { url: endpoint, max_payment_eth: '1' };
  const pending = bridge.server.callToolResult('x402_pay', args);
  args.url = 'https://evil.example/data';
  args.max_payment_eth = '0.18';
  assert.notEqual((await pending).isError, true);
  assert.deepEqual(forwarded, [{ url: endpoint, max_payment_eth: '0.992359' }]);
  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].mode, 'live');
  assert.equal(approvals[0].maxUsdc, '1');
  assert.equal(approvals[0].maxPrincipalUsdc, '0.992359');
  assert.equal(approvals[0].maxProtocolFeeUsdc, '0.007641');
  assert.equal(approvals[0].protocolFeeRecipient, X402_PROTOCOL_FEE_COLLECTOR);
  assert.equal(Object.isFrozen(approvals[0]), true);
  assert.equal(Object.isFrozen(approvals[0].allowedRecipients), true);
  const state = JSON.parse(fs.readFileSync(path.join(auditDir, 'bridge-budget.json'), 'utf8'));
  assert.deepEqual(state.entries.map((entry: { micros: string }) => entry.micros), ['1000000']);
  const events = fs.readFileSync(path.join(auditDir, 'bridge-audit.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const reserved = events.find(event => event.eventType === 'bridge.payment_reserved');
  assert.equal(reserved.maxUsdc, '1');
  assert.equal(reserved.maxPrincipalUsdc, '0.992359');
  assert.equal(reserved.maxProtocolFeeUsdc, '0.007641');
  const receipt = events.find(event => event.eventType === 'bridge.receipt_recorded');
  assert.equal(receipt.endpoint, endpoint);
  assert.equal(receipt.amountAtomic, '992359');
  assert.equal(receipt.protocolFeeAtomic, '7641');
  assert.equal(receipt.totalDebitAtomic, '1000000');
  assert.equal(receipt.protocolFeeRecipient, X402_PROTOCOL_FEE_COLLECTOR);
});

const partialFixtures = ['free', 'after-settlement-error', 'malformed-receipt', 'forged-follow-up-error', 'disconnect'] as const;
for (const mockFixture of partialFixtures) {
  test(`no-funds ${mockFixture} outcome preserves the full reservation across restart`, async t => {
    const module = await bridgeModule();
    const auditDir = fs.mkdtempSync(path.join(os.tmpdir(), `starter-sdk-${mockFixture}-`));
    t.after(() => fs.rmSync(auditDir, { recursive: true, force: true }));
    const oneCallPolicy = { ...policy, maxUsdcPerTx: '0.18', maxUsdcPerDay: '0.18', approvalThresholdUsdc: '0.18' };
    const args = { url: endpoint, max_payment_eth: '0.18', method: 'GET', timeout_ms: 1000, idempotencyKey: 'partial-response-1' };
    const bridge = await module.createBridge({ mode: 'mock', policy: oneCallPolicy, auditDir, mockFixture });
    let result: Awaited<ReturnType<typeof bridge.server.callToolResult>>;
    try { result = await bridge.server.callToolResult('x402_pay', args); }
    finally { await bridge.close(); }
    const expectFree = mockFixture === 'free';
    assert.equal(result.isError === true, !expectFree);
    if (!expectFree) {
      const blocker = result.content[0];
      assert(blocker.type === 'text' && typeof blocker.text === 'string');
      assert.match(blocker.text, /reconcile/i);
    }
    const events = fs.readFileSync(path.join(auditDir, 'bridge-audit.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    const receipts = events.filter(event => event.eventType === 'bridge.receipt_recorded');
    const reserved = events.find(event => event.eventType === 'bridge.payment_reserved');
    assert(reserved);
    assert.equal(reserved.maxUsdc, '0.18');
    assert.equal(events.some(event => event.eventType === 'bridge.no_payment_required'), expectFree);
    if (mockFixture === 'after-settlement-error') {
      assert.equal(receipts.length, 1);
      assert.equal(receipts[0].amountAtomic, '180000');
      assert.equal(receipts[0].payee, recipient);
      assert.equal(receipts[0].mode, 'mock');
      assert.equal(receipts[0].backendError, true);
      assert.equal(receipts[0].reservationId, reserved.reservationId);
      assert(events.indexOf(receipts[0]) < events.findIndex(event => event.eventType === 'bridge.call_blocked_or_failed'));
    } else assert.equal(receipts.length, 0, 'Untrusted body/error text and uncertain transport outcomes cannot become receipt evidence.');
    const budgetPath = path.join(auditDir, 'bridge-budget.json');
    const retained = JSON.parse(fs.readFileSync(budgetPath, 'utf8'));
    assert.equal(retained.entries.length, 1);
    assert.equal(retained.entries[0].micros, '180000');
    assert.equal(retained.entries[0].id, reserved.reservationId);
    const restarted = await module.createBridge({ mode: 'mock', policy: oneCallPolicy, auditDir });
    try { assert.equal((await restarted.server.callToolResult('x402_pay', args)).isError, true); }
    finally { await restarted.close(); }
    assert.deepEqual(JSON.parse(fs.readFileSync(budgetPath, 'utf8')), retained);
    const sink = fs.readFileSync(path.join(auditDir, 'mock-paid-calls.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(sink, [args], 'The first call alone reached the raw mock sink; restart did not refund its bound.');
  });
}

test('mock fixture controls are rejected in live mode before any child starts', async t => {
  const module = await bridgeModule();
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'starter-sdk-no-live-fixture-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  for (const mockFixture of ['paid', ...partialFixtures] as const) {
    const auditDir = path.join(parent, mockFixture);
    await assert.rejects(module.createBridge({ mode: 'live', policy: livePolicy, auditDir, env: syntheticLiveEnv, mockFixture }).then(async unexpectedBridge => { await unexpectedBridge.close(); return unexpectedBridge; }), /mock.*fixture.*live|live.*mock.*fixture/i);
    assert.equal(fs.existsSync(auditDir), false);
  }
  const auditDir = path.join(parent, 'explicit-undefined');
  await assert.rejects(module.createBridge({ mode: 'live', policy: livePolicy, auditDir, env: syntheticLiveEnv, mockFixture: undefined }), /mock.*fixture.*live/i);
  assert.equal(fs.existsSync(auditDir), false);
});

test('unknown mock fixtures fail before starting a child', async t => {
  const module = await bridgeModule();
  const auditDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'starter-sdk-unknown-fixture-')), 'not-created');
  t.after(() => fs.rmSync(path.dirname(auditDir), { recursive: true, force: true }));
  await assert.rejects(module.createBridge({ mode: 'mock', policy, auditDir, mockFixture: 'unsafe' as never }), /Unknown mock response fixture/);
  assert.equal(fs.existsSync(auditDir), false);
});

test('model-writable fixture fields cannot alter the default mock sink', async t => {
  const { bridge, auditDir } = await setup(t, { url: endpoint, max_payment_eth: '0.18' });
  assert.equal((await bridge.server.callToolResult('x402_pay', { url: endpoint, max_payment_eth: '0.18', mockFixture: 'free' })).isError, true);
  assert.equal(fs.existsSync(path.join(auditDir, 'mock-paid-calls.jsonl')), false);
  assert.equal(fs.existsSync(path.join(auditDir, 'bridge-budget.json')), false);
  assert.notEqual((await bridge.server.callToolResult('x402_pay', { url: endpoint, max_payment_eth: '0.18' })).isError, true);
  const events = fs.readFileSync(path.join(auditDir, 'bridge-audit.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert(events.some(event => event.eventType === 'bridge.receipt_recorded'));
});
