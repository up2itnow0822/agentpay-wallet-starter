import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MCPServerStdio } from '@openai/agents';
import { X402_PROTOCOL_FEE_COLLECTOR } from './security.mjs';

const endpoint = 'https://merchant.example/paid-weather';
const recipient = `0x${'1'.repeat(40)}`;
function assertGatewayContract(tools, mode, policy) {
  assert.deepEqual(tools.map(tool => tool.name).sort(), ['get_wallet_info', 'x402_pay']);
  assert.deepEqual(tools.find(tool => tool.name === 'get_wallet_info').inputSchema, { type: 'object', properties: {}, required: [], additionalProperties: false });
  const payment = tools.find(tool => tool.name === 'x402_pay');
  const schema = payment.inputSchema;
  assert.deepEqual(schema.required, ['url', 'max_payment_eth']);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties).sort(), ['idempotencyKey', 'max_payment_eth', 'method', 'timeout_ms', 'url']);
  assert.deepEqual(schema.properties.url.enum, policy.allowedEndpoints);
  assert.deepEqual(schema.properties.method.enum, ['GET']);
  assert.equal(schema.properties.max_payment_eth.type, 'string');
  assert.match(schema.properties.max_payment_eth.description, /USDC.*total|total.*USDC/i);
  assert.equal(schema.properties.timeout_ms.minimum, 1000);
  assert.equal(schema.properties.timeout_ms.maximum, 60000);
  assert.equal(schema.properties.idempotencyKey.minLength, 1);
  assert.equal(schema.properties.idempotencyKey.maxLength, 128);
  for (const value of [mode, ...policy.allowedEndpoints, ...policy.allowedRecipients.map(value => value.toLowerCase()), policy.maxUsdcPerTx, policy.maxUsdcPerDay, policy.approvalThresholdUsdc]) assert(payment.description.includes(value), value);
  assert.match(payment.description, /above.*threshold.*always den(?:y|ied)/i);
}

test('generic client gateway applies the same allowlist, cap and denial boundary over stdio', async t => {
  const auditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'starter-gateway-test-'));
  const gateway = new MCPServerStdio({ name: 'Starter gateway smoke', command: process.execPath, args: [fileURLToPath(new URL('./gateway.mjs', import.meta.url))], env: { AGENTPAY_MOCK_AUDIT_DIR: auditDir } });
  t.after(async () => { await gateway.close(); fs.rmSync(auditDir, { recursive: true, force: true }); });
  await gateway.connect();
  const policy = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./policy.example.json', import.meta.url)), 'utf8'));
  assertGatewayContract(await gateway.listTools(), 'mock', policy);
  const allowed = await gateway.callToolResult('x402_pay', { url: 'https://merchant.example/paid-weather', max_payment_eth: '0.18' });
  assert.notEqual(allowed.isError, true);
  for (const [name, args] of [
    ['set_spend_policy', { dailyLimitEth: '999' }],
    ['x402_pay', { url: 'https://evil.example/data', max_payment_eth: '0.18' }],
    ['x402_pay', { url: 'https://merchant.example/paid-weather', max_payment_eth: '0.65' }],
  ]) assert.equal((await gateway.callToolResult(name, args)).isError, true);
  const calls = fs.readFileSync(path.join(auditDir, 'mock-paid-calls.jsonl'), 'utf8').trim().split('\n');
  assert.equal(calls.length, 1);
});

test('live gateway advertises the reviewed total debit policy without payment I/O', async t => {
  const auditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'starter-live-gateway-schema-'));
  const policy = { allowedEndpoints: [endpoint], allowedRecipients: [recipient, X402_PROTOCOL_FEE_COLLECTOR], maxUsdcPerTx: '1', maxUsdcPerDay: '5', approvalThresholdUsdc: '0.25' };
  const policyPath = path.join(auditDir, 'reviewed-policy.json');
  fs.writeFileSync(policyPath, JSON.stringify(policy));
  const gateway = new MCPServerStdio({ name: 'Starter live gateway schema test', command: process.execPath, args: [fileURLToPath(new URL('./gateway.mjs', import.meta.url))], env: { AGENTPAY_MODE: 'live', AGENTPAY_OPERATOR_ACK: 'reviewed-policy-and-wallet', AGENTPAY_POLICY_PATH: policyPath, AGENTPAY_ENABLE_LIVE: 'yes', AGENT_PRIVATE_KEY: `0x${'2'.repeat(64)}`, AGENT_WALLET_ADDRESS: recipient, CHAIN_ID: '84532', RPC_URL: 'https://rpc.invalid.example' } });
  t.after(async () => { await gateway.close(); fs.rmSync(auditDir, { recursive: true, force: true }); });
  await gateway.connect();
  assertGatewayContract(await gateway.listTools(), 'live', policy);
});
