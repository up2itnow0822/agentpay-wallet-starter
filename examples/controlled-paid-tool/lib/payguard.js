const DEFAULT_BASE_URL = 'https://payguard-production-abfe.up.railway.app';

function blocked(reason, details = {}) {
  return {
    decision: 'blocked',
    reason,
    provider: 'payguard',
    ...details,
  };
}

function buildIntent({ challenge, goal, endpoint, agentId = 'agentpay-wallet-starter' }) {
  return {
    intent_id: challenge.challengeId,
    agent_id: agentId,
    rail: challenge.challengeScheme || 'x402',
    amount_minor: Math.round(Number(challenge.amountUsd) * 100),
    currency: challenge.currency,
    payee: challenge.payTo,
    endpoint,
    context: {
      purpose: goal,
      expected_price_minor: Math.round(Number(challenge.amountUsd) * 100),
      source_trust: 'trusted',
    },
  };
}

function validateReceipt(receipt, intent) {
  if (!receipt || typeof receipt !== 'object') throw new Error('missing authorization receipt');
  if (!receipt.receipt_id || !receipt.receipt_hash || !receipt.request_hash) {
    throw new Error('incomplete authorization receipt');
  }
  if (receipt.intent_id !== intent.intent_id) throw new Error('receipt intent mismatch');
  if (receipt.amount_minor !== intent.amount_minor) throw new Error('receipt amount mismatch');
  if (receipt.currency !== intent.currency) throw new Error('receipt currency mismatch');
  if (receipt.rail !== intent.rail) throw new Error('receipt rail mismatch');
  if (!receipt.expires_at || Date.parse(receipt.expires_at) <= Date.now()) {
    throw new Error('expired authorization receipt');
  }
}

function mapDecision(receipt) {
  if (receipt.decision === 'ALLOW') {
    return {
      decision: 'allowed',
      reason: `PayGuard allowed the exact payment intent (${receipt.receipt_id}).`,
    };
  }
  if (receipt.decision === 'REQUIRE_APPROVAL') {
    return {
      decision: 'approval_required',
      reason: `PayGuard requires approval: ${(receipt.reasons || []).join(', ') || 'no reason code supplied'}.`,
    };
  }
  if (receipt.decision === 'BLOCK') {
    return blocked(`PayGuard blocked the payment: ${(receipt.reasons || []).join(', ') || 'no reason code supplied'}.`);
  }
  return blocked(`PayGuard returned an unsupported decision: ${String(receipt.decision)}.`);
}

async function checkPayGuard({
  challenge,
  goal,
  token,
  endpoint,
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = 5000,
}) {
  if (!token) return blocked('PayGuard client token is missing.');
  if (!endpoint) return blocked('PAYGUARD_ENDPOINT is missing.');
  if (typeof fetchImpl !== 'function') return blocked('fetch is unavailable; use Node.js 20 or newer.');

  const intent = buildIntent({ challenge, goal, endpoint });
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/check`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(intent),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const receipt = await response.json().catch(() => null);
    if (!response.ok) return blocked(`PayGuard /check returned HTTP ${response.status}.`);
    validateReceipt(receipt, intent);
    return {
      ...mapDecision(receipt),
      provider: 'payguard',
      providerDecision: receipt.decision,
      receiptId: receipt.receipt_id,
      receiptHash: receipt.receipt_hash,
      reasons: receipt.reasons || [],
    };
  } catch (error) {
    return blocked(`PayGuard check failed closed: ${error.message}`);
  }
}

function combinePolicyDecisions(localDecision, externalDecision) {
  if (!externalDecision) return localDecision;
  if (localDecision.decision === 'blocked' || externalDecision.decision === 'blocked') {
    return localDecision.decision === 'blocked' ? localDecision : externalDecision;
  }
  if (localDecision.decision === 'approval_required' || externalDecision.decision === 'approval_required') {
    const reasons = [localDecision, externalDecision]
      .filter((item) => item.decision === 'approval_required')
      .map((item) => item.reason);
    return { decision: 'approval_required', reason: reasons.join(' ') };
  }
  return {
    decision: 'allowed',
    reason: `${localDecision.reason} ${externalDecision.reason}`,
  };
}

module.exports = {
  buildIntent,
  checkPayGuard,
  combinePolicyDecisions,
  validateReceipt,
};
