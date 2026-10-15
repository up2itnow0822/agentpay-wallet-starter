import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as security from './security.mjs';
import * as runtime from './server-runtime.mjs';

// Load exactly the SDK instance used by the locked MCP server. Only wallet I/O
// and HTTP I/O are replaced; its policy and two-leg settlement code are real.
const require = createRequire(import.meta.url);
const serverRequire = createRequire(require.resolve('agentpay-mcp'));
const sdk = serverRequire('agentwallet-sdk');
const budget = serverRequire('agentpay-mcp/dist/tools/budget.js');
const { createAgentPayX402Client } = serverRequire('agentpay-mcp/dist/utils/x402-client.js');
const endpoint = 'https://merchant.example/paid-weather';
const recipient = `0x${'1'.repeat(40)}`;
const feeCollector = '0xff86829393C6C26A4EC122bE0Cc3E466Ef876AdD';
const usdc = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const policy = (cap = '1') => ({ allowedEndpoints: [endpoint], allowedRecipients: [recipient, feeCollector], maxUsdcPerTx: cap, maxUsdcPerDay: cap, approvalThresholdUsdc: cap });
const policyServer = { callToolResult: async (_name, args) => budget.handleSetSpendPolicy(args) };
runtime.restrictTokenRegistry(sdk.getGlobalRegistry(), '84532');

test.beforeEach(() => budget._resetPolicyStore());
test.afterEach(() => budget._resetPolicyStore());

function localWallet() {
  const transfers = [];
  const confirmed = [];
  const wallet = {
    address: `0x${'2'.repeat(40)}`,
    chain: { id: 84532 },
    walletClient: { account: { address: recipient } },
    contract: {
      read: { remainingBudget: async () => [2_000_000n, 2_000_000n] },
      write: { agentTransferToken: async args => {
        const hash = `0x${String(transfers.length + 1).repeat(64)}`;
        transfers.push({ token: args[0], recipient: args[1], amount: args[2], hash });
        return hash;
      } },
    },
    publicClient: { waitForTransactionReceipt: async ({ hash }) => {
      confirmed.push(hash);
      return { transactionHash: hash, status: 'success', logs: [] };
    } },
  };
  return { wallet, transfers, confirmed };
}

function installChallenge(t, principal, payee = recipient) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async input => {
    assert.equal(String(input), endpoint, 'No real HTTP or RPC is permitted in this test.');
    calls.push(String(input));
    if (calls.length === 1) return new Response(JSON.stringify({
      x402Version: 1,
      resource: { url: endpoint },
      accepts: [{ scheme: 'exact', network: 'base-sepolia:84532', asset: 'USDC', amount: principal.toString(), payTo: payee, maxTimeoutSeconds: 60 }],
    }), { status: 402 });
    assert.equal(calls.length, 2, 'Only one local paid retry is allowed.');
    return new Response('paid fixture');
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  return calls;
}

function guard(t, p) {
  const auditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'starter-pinned-policy-'));
  t.after(() => fs.rmSync(auditDir, { recursive: true, force: true }));
  return { auditDir, gate: security.createPaymentGuard(p, { auditDir, mode: 'live' }) };
}

test('pinned SDK fee exports match the bridge authorization arithmetic', () => {
  assert.equal(typeof runtime.assertPinnedProtocolFee, 'function');
  runtime.assertPinnedProtocolFee(sdk);
});

test('pinned settlement principal plus protocol fee fits the durable total authorization', async t => {
  const p = policy();
  const { gate, auditDir } = guard(t, p);
  await gate.authorize('x402_pay', { url: endpoint, max_payment_eth: '0.999999' });
  await security.configureServerPolicy(policyServer, p);
  const bounds = security.paymentBounds('0.999999', 'live');
  const principal = bounds.principalMicros;
  const calls = installChallenge(t, principal);
  const { wallet, transfers, confirmed } = localWallet();
  const client = createAgentPayX402Client(wallet, { chainId: 84532, maxPaymentEth: bounds.maxPrincipalUsdc });
  try {
    const response = await client.client.fetch(endpoint);
    assert.equal(response.status, 200);
    assert.equal(calls.length, 2);
    assert.equal(transfers.length, 2, 'Both the fee and merchant legs must be exercised.');
    assert.deepEqual(transfers.map(transfer => transfer.recipient.toLowerCase()), [feeCollector.toLowerCase(), recipient]);
    assert(transfers.every(transfer => transfer.token.toLowerCase() === usdc.toLowerCase()));
    assert.deepEqual(confirmed, transfers.map(transfer => transfer.hash));
    const totalDebit = transfers.reduce((total, transfer) => total + transfer.amount, 0n);
    const reserved = JSON.parse(fs.readFileSync(path.join(auditDir, 'bridge-budget.json'), 'utf8')).entries[0].micros;
    assert(totalDebit <= BigInt(reserved), `Actual debit ${totalDebit} must fit the ${reserved} reserved total.`);
    assert(totalDebit <= 999_999n);
    assert(totalDebit <= 1_000_000n, 'Wallet debit must also fit host transaction and day caps.');
    assert(transfers.every(transfer => gate.policy.allowedRecipients.includes(transfer.recipient.toLowerCase())));
    assert.equal(transfers[0].amount, sdk.x402ProtocolFeeAmount(transfers[1].amount));
  } finally { client.releaseUnusedReservation(); }
});

test('pinned client rejects a challenge whose principal plus fee exceeds the total before signing', async t => {
  await security.configureServerPolicy(policyServer, policy());
  const calls = installChallenge(t, 999_999n);
  const { wallet, transfers, confirmed } = localWallet();
  const bounds = security.paymentBounds('0.999999', 'live');
  const client = createAgentPayX402Client(wallet, { chainId: 84532, maxPaymentEth: bounds.maxPrincipalUsdc });
  try {
    await assert.rejects(client.client.fetch(endpoint), /cap|exceeds/i);
    assert.equal(calls.length, 1);
    assert.deepEqual(transfers, [], 'Over-bound challenge must never reach a wallet write.');
    assert.deepEqual(confirmed, []);
  } finally { client.releaseUnusedReservation(); }
});

test('pinned client rejects a merchant outside the live allowlist before either transfer', async t => {
  await security.configureServerPolicy(policyServer, policy());
  installChallenge(t, 100_000n, `0x${'4'.repeat(40)}`);
  const { wallet, transfers } = localWallet();
  const client = createAgentPayX402Client(wallet, { chainId: 84532, maxPaymentEth: '0.992359' });
  try {
    await assert.rejects(client.client.fetch(endpoint), /allowlist|merchant|recipient/i);
    assert.deepEqual(transfers, []);
  } finally { client.releaseUnusedReservation(); }
});

test('actual pinned policy approves host-cap equality but refuses the next USDC unit', async () => {
  const p = { ...policy(), maxUsdcPerDay: '5' };
  await security.configureServerPolicy(policyServer, p);
  const exact = await budget.reserveSpendPolicy({ merchant: recipient, amount: 1_000_000n, decimals: 6 });
  assert.equal(exact.decision.status, 'approved', exact.decision.reason);
  budget.releaseSpendReservation(exact.reservation);
  const above = await budget.reserveSpendPolicy({ merchant: recipient, amount: 1_000_001n, decimals: 6 });
  assert.notEqual(above.decision.status, 'approved');
  budget.releaseSpendReservation(above.reservation);
});

test('actual pinned zero-fee settlement accepts equality without raising the total daily cap', async t => {
  await security.configureServerPolicy(policyServer, policy('0.0001'));
  assert.equal(sdk.x402ProtocolFeeAmount(100n), 0n);
  installChallenge(t, 100n);
  const { wallet, transfers } = localWallet();
  const client = createAgentPayX402Client(wallet, { chainId: 84532, maxPaymentEth: '0.0001' });
  try {
    assert.equal((await client.client.fetch(endpoint)).status, 200);
    assert.deepEqual(transfers.map(transfer => transfer.amount), [100n]);
    const next = await budget.reserveSpendPolicy({ merchant: recipient, amount: 1n, decimals: 6 });
    assert.notEqual(next.decision.status, 'approved', 'The original daily cap must remain spent.');
    budget.releaseSpendReservation(next.reservation);
  } finally { client.releaseUnusedReservation(); }
});
