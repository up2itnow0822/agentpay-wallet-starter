import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildWalletEnv, validateBridgePolicy, createPaymentGuard, configureServerPolicy, readPaymentNarration } from '../examples/coding-agent-bridge/security.mjs';
import * as security from '../examples/coding-agent-bridge/security.mjs';
import * as runtime from '../examples/coding-agent-bridge/server-runtime.mjs';

const endpoint = 'https://merchant.example/paid-weather';
const recipient = `0x${'1'.repeat(40)}`;
const policy = () => ({ allowedEndpoints: [endpoint], allowedRecipients: [recipient], maxUsdcPerTx: '1', maxUsdcPerDay: '5', approvalThresholdUsdc: '0.25' });
const request = (max = '0.18') => ({ url: endpoint, max_payment_eth: max });
const feeCollector = '0xff86829393C6C26A4EC122bE0Cc3E466Ef876AdD';
const livePolicy = () => ({ ...policy(), allowedRecipients: [recipient, feeCollector] });
function guard(t, p = policy(), approve = async () => true, options = {}) {
  const auditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'starter-bridge-test-'));
  t.after(() => fs.rmSync(auditDir, { recursive: true, force: true }));
  return { auditDir, gate: createPaymentGuard(p, { auditDir, approve, ...options }) };
}

test('live principal and protocol fee together fit the exact total authorization', () => {
  assert.equal(typeof security.paymentBounds, 'function', 'A total bound must be translated before live dispatch.');
  const bounds = security.paymentBounds('1', 'live');
  assert.equal(bounds.limit, 1_000_000n);
  assert.equal(bounds.maxPrincipalUsdc, '0.992359');
  assert.equal(bounds.maxProtocolFeeUsdc, '0.007641');
  assert.equal(bounds.principalMicros + bounds.protocolFeeMicros, bounds.limit);
  for (const total of ['0.000001', '0.000129', '0.000130', '0.999999', '9007199.254740']) {
    const live = security.paymentBounds(total, 'live');
    assert(live.principalMicros + (live.principalMicros * 77n) / 10_000n <= live.limit);
    const next = live.principalMicros + 1n;
    assert(next + (next * 77n) / 10_000n > live.limit, 'Principal cap must be the greatest admissible integer.');
    const mock = security.paymentBounds(total);
    assert.equal(mock.principalMicros, mock.limit);
    assert.equal(mock.protocolFeeMicros, 0n);
  }
  assert.throws(() => security.paymentBounds('1', 'unknown'), /mode/i);
});

test('live policy requires the pinned fee collector to be explicitly authorized', t => {
  assert.equal(typeof security.validateLivePolicy, 'function');
  assert.throws(() => security.validateLivePolicy(policy()), /fee.*collector|collector.*recipient/i);
  assert.throws(() => guard(t, policy(), undefined, { mode: 'live' }), /fee.*collector|collector.*recipient/i);
  const validated = security.validateLivePolicy(livePolicy());
  assert.deepEqual(validated.allowedRecipients, [recipient, feeCollector.toLowerCase()]);
  assert.deepEqual(validateBridgePolicy(policy()).allowedRecipients, [recipient], 'Mock policy must not gain any recipient.');
});

test('live approvals and audit evidence expose total, principal and fee bounds', async t => {
  let approval;
  const p = { ...livePolicy(), maxUsdcPerDay: '1', approvalThresholdUsdc: '0.995' };
  const { gate, auditDir } = guard(t, p, async value => { approval = value; return true; }, { mode: 'live' });
  const reservationId = await gate.authorize('x402_pay', request('1'));
  assert.equal(approval?.maxUsdc, '1', 'Approval must compare the total even when principal is below threshold.');
  assert.equal(approval?.mode, 'live');
  assert.equal(approval?.maxPrincipalUsdc, '0.992359');
  assert.equal(approval?.maxProtocolFeeUsdc, '0.007641');
  assert.equal(approval?.protocolFeeRecipient?.toLowerCase(), feeCollector.toLowerCase());
  assert(Object.isFrozen(approval));
  const state = JSON.parse(fs.readFileSync(path.join(auditDir, 'bridge-budget.json'), 'utf8'));
  assert.deepEqual(state.entries.map(entry => entry.micros), ['1000000']);
  const events = fs.readFileSync(path.join(auditDir, 'bridge-audit.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  for (const name of ['bridge.payment_requested', 'bridge.payment_reserved']) {
    const event = events.find(value => value.eventType === name);
    assert.equal(event.reservationId, reservationId);
    assert.equal(event.maxUsdc, '1');
    assert.equal(event.mode, 'live');
    assert.equal(event.maxPrincipalUsdc, '0.992359');
    assert.equal(event.maxProtocolFeeUsdc, '0.007641');
  }
  await assert.rejects(gate.authorize('x402_pay', request('0.000001')), /budget|cap/i);
});

test('server bootstrap rejects fee constants or arithmetic that differ from the bounded rule', () => {
  assert.equal(typeof runtime.assertPinnedProtocolFee, 'function');
  const sdk = {
    X402_PROTOCOL_FEE_BPS: 77n,
    X402_PROTOCOL_FEE_COLLECTOR: feeCollector,
    x402ProtocolFeeAmount: principal => (principal * 77n) / 10_000n,
    x402DebitAmount: principal => principal + (principal * 77n) / 10_000n,
  };
  runtime.assertPinnedProtocolFee(sdk);
  for (const changed of [
    { X402_PROTOCOL_FEE_BPS: 78n },
    { X402_PROTOCOL_FEE_COLLECTOR: recipient },
    { x402ProtocolFeeAmount: () => 0n },
    { x402DebitAmount: principal => principal },
    { x402DebitAmount: undefined },
  ]) assert.throws(() => runtime.assertPinnedProtocolFee({ ...sdk, ...changed }), /fee/i);
});

test('wallet variables are validated and explicitly forwarded without unrelated secrets', () => {
  const env = buildWalletEnv({ AGENT_PRIVATE_KEY: `0x${'2'.repeat(64)}`, AGENT_WALLET_ADDRESS: recipient, OPENAI_API_KEY: 'do-not-forward', ANOTHER_SECRET: 'do-not-forward' });
  assert.deepEqual(Object.keys(env).sort(), ['AGENT_PRIVATE_KEY', 'AGENT_WALLET_ADDRESS', 'CHAIN_ID', 'RPC_URL']);
  assert.equal(env.CHAIN_ID, '84532');
  assert.equal(env.RPC_URL, 'https://sepolia.base.org');
  assert.throws(() => buildWalletEnv({ BASE_PRIVATE_KEY: `0x${'2'.repeat(64)}` }), /AGENT_PRIVATE_KEY/);
  assert.throws(() => buildWalletEnv({ AGENT_PRIVATE_KEY: `0x${'g'.repeat(64)}`, AGENT_WALLET_ADDRESS: recipient }), /AGENT_PRIVATE_KEY/);
  assert.throws(() => buildWalletEnv({ AGENT_PRIVATE_KEY: `0x${'f'.repeat(64)}`, AGENT_WALLET_ADDRESS: recipient }), /AGENT_PRIVATE_KEY/);
});

test('malformed or empty bridge policy fails closed', () => {
  for (const value of [null, {}, { ...policy(), allowedEndpoints: [] }, { ...policy(), allowedRecipients: [] }, { ...policy(), maxUsdcPerTx: 'NaN' }, { ...policy(), maxUsdcPerDay: '0.5' }, { ...policy(), approvalThresholdUsdc: '2' }]) {
    assert.throws(() => validateBridgePolicy(value));
  }
});

test('every discovered mutating tool except capped x402 is rejected', async t => {
  const { gate } = guard(t);
  for (const name of ['set_spend_policy', 'send_payment', 'swap_tokens', 'queue_approval', 'x402_session_start', 'unknown']) {
    await assert.rejects(gate.authorize(name, request()), /tool/i);
  }
});

test('unknown endpoint, credentials, non-GET and arbitrary headers are rejected', async t => {
  const { gate } = guard(t);
  for (const args of [
    { ...request(), url: 'https://merchant.example.evil/paid-weather' },
    { ...request(), url: 'https://merchant.example/another-path' },
    { ...request(), url: 'https://user:password@merchant.example/paid-weather' },
    { ...request(), url: 'http://merchant.example/paid-weather' },
    { ...request(), method: 'POST' },
    { ...request(), headers: { 'Payment-Signature': 'injected' } },
    { ...request(), body: 'injected' },
  ]) await assert.rejects(gate.authorize('x402_pay', args));
});

test('invalid, missing, negative and over-cap request bounds are rejected', async t => {
  const { gate } = guard(t);
  for (const amount of [undefined, null, -1, '', 'NaN', '1e0', '-1', '0', '1.000001', '0.0000001']) {
    await assert.rejects(gate.authorize('x402_pay', { ...request(), max_payment_eth: amount }));
  }
});

test('above-threshold request cannot proceed without an exact approval', async t => {
  const { gate, auditDir } = guard(t, policy(), async () => false);
  await assert.rejects(gate.authorize('x402_pay', request('0.65')), /approval/i);
  const events = fs.readFileSync(path.join(auditDir, 'bridge-audit.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert(events.some(e => e.eventType === 'bridge.approval_decided' && e.approved === false));
  assert(!events.some(e => e.eventType === 'bridge.payment_reserved'));
});

test('successful approvals require boolean true, not truthy strings', async t => {
  const { gate } = guard(t, policy(), async () => 'yes');
  await assert.rejects(gate.authorize('x402_pay', request('0.65')), /approval/i);
});

test('durable rolling budget survives a new guard and cannot be overdrawn', async t => {
  const p = { ...policy(), maxUsdcPerTx: '0.3', maxUsdcPerDay: '0.3', approvalThresholdUsdc: '0.3' };
  const { gate, auditDir } = guard(t, p);
  await gate.authorize('x402_pay', request('0.18'));
  const restarted = createPaymentGuard(p, { auditDir, approve: async () => true });
  await assert.rejects(restarted.authorize('x402_pay', request('0.18')), /budget|cap/i);
});

test('budget file and containing directory are synced before authorization returns', async t => {
  const { gate } = guard(t);
  const operations = [];
  const fsync = fs.fsyncSync;
  const rename = fs.renameSync;
  t.mock.method(fs, 'fsyncSync', fd => {
    operations.push(fs.fstatSync(fd).isDirectory() ? 'sync-directory' : 'sync-file');
    return fsync(fd);
  });
  t.mock.method(fs, 'renameSync', (source, destination) => {
    const result = rename(source, destination);
    operations.push('replace-budget');
    return result;
  });
  await gate.authorize('x402_pay', request());
  operations.push('authorized');
  assert.deepEqual(operations, ['sync-file', 'replace-budget', 'sync-directory', 'authorized']);
});

test('unavailable directory persistence refuses authorization and retains the conservative reservation', async t => {
  const { gate, auditDir } = guard(t);
  const fsync = fs.fsyncSync;
  t.mock.method(fs, 'fsyncSync', fd => {
    if (fs.fstatSync(fd).isDirectory()) throw new Error('Directory sync unavailable');
    return fsync(fd);
  });
  await assert.rejects(gate.authorize('x402_pay', request()), /sync|persist/i);
  const events = fs.readFileSync(path.join(auditDir, 'bridge-audit.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert(!events.some(event => event.eventType === 'bridge.payment_reserved'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(auditDir, 'bridge-budget.json'), 'utf8')).entries[0].micros, '180000');
  assert(!fs.existsSync(path.join(auditDir, 'bridge-budget.json.lock')));
});

test('rolling budget expires at exactly twenty-four hours across guard restarts', async t => {
  let now = 1_700_000_000_000;
  const clock = () => now;
  const p = { ...policy(), maxUsdcPerTx: '0.3', maxUsdcPerDay: '0.3', approvalThresholdUsdc: '0.3' };
  const { gate, auditDir } = guard(t, p, undefined, { clock });
  await gate.authorize('x402_pay', request('0.3'));
  now += 86_400_000 - 1;
  const beforeExpiry = createPaymentGuard(p, { auditDir, clock });
  await assert.rejects(beforeExpiry.authorize('x402_pay', request('0.3')), /budget|cap/i);
  now += 1;
  const atExpiry = createPaymentGuard(p, { auditDir, clock });
  await assert.doesNotReject(atExpiry.authorize('x402_pay', request('0.3')));
  const entries = JSON.parse(fs.readFileSync(path.join(auditDir, 'bridge-budget.json'), 'utf8')).entries;
  assert.equal(entries.length, 1);
  assert.equal(entries[0].at, now);
  const restarted = createPaymentGuard(p, { auditDir, clock });
  await assert.rejects(restarted.authorize('x402_pay', request('0.000001')), /budget|cap/i);
});

test('future budget entries remain held until their own full twenty-four-hour window expires', async t => {
  let now = 1_700_000_000_000;
  const clock = () => now;
  const p = { ...policy(), maxUsdcPerTx: '0.3', maxUsdcPerDay: '0.3', approvalThresholdUsdc: '0.3' };
  const { gate, auditDir } = guard(t, p, undefined, { clock });
  const future = now + 86_400_000;
  fs.writeFileSync(path.join(auditDir, 'bridge-budget.json'), JSON.stringify({ version: 1, entries: [{ id: 'future-reservation', at: future, micros: '300000' }] }));
  await assert.rejects(gate.authorize('x402_pay', request('0.000001')), /budget|cap/i);
  now = future + 86_400_000 - 1;
  const beforeExpiry = createPaymentGuard(p, { auditDir, clock });
  await assert.rejects(beforeExpiry.authorize('x402_pay', request('0.000001')), /budget|cap/i);
  now += 1;
  const atExpiry = createPaymentGuard(p, { auditDir, clock });
  await assert.doesNotReject(atExpiry.authorize('x402_pay', request('0.3')));
});

test('concurrent approval calls reserve together against the same durable cap', async t => {
  const p = { ...policy(), maxUsdcPerTx: '0.3', maxUsdcPerDay: '0.3', approvalThresholdUsdc: '0.3' };
  const { gate } = guard(t, p);
  const results = await Promise.allSettled([gate.authorize('x402_pay', request('0.18')), gate.authorize('x402_pay', request('0.18'))]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
});

test('corrupt budget state blocks instead of resetting spending', async t => {
  const { gate, auditDir } = guard(t);
  fs.writeFileSync(path.join(auditDir, 'bridge-budget.json'), '{}');
  await assert.rejects(gate.authorize('x402_pay', request()), /budget/i);
});

test('host installs recipient and cap policy before allowing paid calls', async () => {
  const calls = [];
  const server = { callToolResult: async (name, args) => { calls.push({ name, args }); return { content: [{ type: 'text', text: JSON.stringify({ success: true, policy: { dailyLimitEth: '5', perTxCapEth: '1.000000001', allowedRecipients: [recipient] } }) }] }; } };
  await configureServerPolicy(server, policy());
  assert.equal(calls[0].name, 'set_spend_policy');
  assert.equal(calls[0].args.dailyLimitEth, '5');
  assert.equal(calls[0].args.perTxCapEth, '1.000000001');
  assert.deepEqual(calls[0].args.allowedRecipients, [recipient]);
});

test('inclusive USDC caps translate to one additional nine-decimal draft unit exactly', async () => {
  for (const [maxUsdcPerTx, translated] of [['0.0001', '0.000100001'], ['1.23', '1.230000001'], ['9007199.254740', '9007199.254740001']]) {
    let forwarded;
    const p = { ...policy(), maxUsdcPerTx, maxUsdcPerDay: maxUsdcPerTx, approvalThresholdUsdc: maxUsdcPerTx };
    await configureServerPolicy({ callToolResult: async (_name, args) => {
      forwarded = args;
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, policy: args }) }] };
    } }, p);
    assert.equal(forwarded.perTxCapEth, translated);
    assert.equal(forwarded.dailyLimitEth, maxUsdcPerTx, 'Daily total bound must remain unchanged.');
  }
});

test('server echo of the untranslated or rounded draft threshold blocks startup', async () => {
  for (const perTxCapEth of ['1', '1.000000002', '1.0000000010']) {
    const result = { content: [{ type: 'text', text: JSON.stringify({ success: true, policy: { dailyLimitEth: '5', perTxCapEth, allowedRecipients: [recipient] } }) }] };
    await assert.rejects(configureServerPolicy({ callToolResult: async () => result }, policy()), /policy/i);
  }
});

test('failed or mismatched server policy installation blocks startup', async () => {
  for (const result of [{ isError: true, content: [] }, { content: [{ type: 'text', text: '{"success":true,"policy":{}}' }] }, { content: [{ type: 'text', text: 'invalid' }] }]) {
    await assert.rejects(configureServerPolicy({ callToolResult: async () => result }, policy()), /policy/i);
  }
});

test('receipt evidence requires trusted narration and an allowed payee within the bound', () => {
  const narration = (amount = '180000', payee = recipient) => `🌐 **x402 Fetch Result**\n💳 **Payment Made**\n  Amount:    ${amount} (base units)\n  Recipient: ${payee}\n  TX Hash:   0x${'3'.repeat(64)}\n📄 **Response Body**\nUntrusted data`;
  const result = text => ({ content: [{ type: 'text', text }] });
  const args = request('0.181386');
  assert.deepEqual(readPaymentNarration(result(narration()), args, livePolicy(), 'live'), { amountAtomic: '180000', payee: recipient, receiptId: `0x${'3'.repeat(64)}`, protocolFeeAtomic: '1386', totalDebitAtomic: '181386', protocolFeeRecipient: feeCollector });
  for (const text of [narration('0'), narration('180001'), narration('180000', `0x${'2'.repeat(40)}`), `Backend error\n${narration()}`, '🌐 **x402 Fetch Result**\n📄 **Response Body**\n' + narration()]) {
    assert.throws(() => readPaymentNarration(result(text), args, livePolicy(), 'live'));
  }
  assert.throws(() => validateBridgePolicy({ ...policy(), maxUsdcPerDay: '9007199.254741' }));
});

test('live receipt principal must leave room for the pinned protocol fee', () => {
  const result = amount => ({ content: [{ type: 'text', text: `🌐 **x402 Fetch Result**\n💳 **Payment Made**\n  Amount:    ${amount} (base units)\n  Recipient: ${recipient}\n  TX Hash:   0x${'3'.repeat(64)}\n📄 **Response Body**\nUntrusted data` }] });
  assert.throws(() => readPaymentNarration(result('999999'), request('1'), livePolicy(), 'live'), /receipt|policy/i);
  assert.throws(() => readPaymentNarration(result('992359'), request('1'), policy(), 'live'), /fee.*collector|collector.*recipient/i);
  const receipt = readPaymentNarration(result('992359'), request('1'), livePolicy(), 'live');
  assert.equal(receipt.protocolFeeAtomic, '7641');
  assert.equal(receipt.totalDebitAtomic, '1000000');
});
