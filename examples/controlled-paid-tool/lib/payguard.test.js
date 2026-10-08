const assert = require('node:assert/strict');
const test = require('node:test');
const { checkPayGuard, combinePolicyDecisions } = require('./payguard');

const challenge = {
  challengeId: 'challenge-123',
  challengeScheme: 'simulated-x402',
  amountUsd: 0.18,
  currency: 'USD',
  payTo: 'demo://premium_weather_signal',
};

function response(decision, overrides = {}) {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        decision,
        reasons: decision === 'BLOCK' ? ['test_block'] : [],
        receipt_id: 'receipt-1',
        receipt_hash: 'hash-1',
        request_hash: 'request-1',
        intent_id: challenge.challengeId,
        amount_minor: 18,
        currency: 'USD',
        rail: 'simulated-x402',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        ...overrides,
      };
    },
  };
}

const base = {
  challenge,
  goal: 'Fetch a weather signal.',
  token: 'test-token',
  endpoint: 'https://example.test/paid-tool',
};

test('maps an exact ALLOW receipt', async () => {
  const result = await checkPayGuard({ ...base, fetchImpl: async () => response('ALLOW') });
  assert.equal(result.decision, 'allowed');
  assert.equal(result.receiptId, 'receipt-1');
});

test('maps BLOCK and does not allow settlement', async () => {
  const result = await checkPayGuard({ ...base, fetchImpl: async () => response('BLOCK') });
  assert.equal(result.decision, 'blocked');
  assert.deepEqual(result.reasons, ['test_block']);
});

test('maps REQUIRE_APPROVAL', async () => {
  const result = await checkPayGuard({ ...base, fetchImpl: async () => response('REQUIRE_APPROVAL') });
  assert.equal(result.decision, 'approval_required');
});

test('fails closed on a receipt mismatch', async () => {
  const result = await checkPayGuard({
    ...base,
    fetchImpl: async () => response('ALLOW', { amount_minor: 19 }),
  });
  assert.equal(result.decision, 'blocked');
  assert.match(result.reason, /amount mismatch/);
});

test('fails closed on a network error', async () => {
  const result = await checkPayGuard({
    ...base,
    fetchImpl: async () => { throw new Error('offline'); },
  });
  assert.equal(result.decision, 'blocked');
  assert.match(result.reason, /offline/);
});

test('a block overrides the local allow decision', () => {
  const combined = combinePolicyDecisions(
    { decision: 'allowed', reason: 'local allow' },
    { decision: 'blocked', reason: 'external block' }
  );
  assert.equal(combined.decision, 'blocked');
  assert.equal(combined.reason, 'external block');
});
