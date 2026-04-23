const crypto = require('node:crypto');

function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

function requestPaidTool({ toolName, scenarioName, amountUsd, toolInput, challengeScheme }) {
  return {
    status: 402,
    challengeId: createId('challenge'),
    toolName,
    scenarioName,
    amountUsd,
    currency: 'USD',
    challengeScheme,
    payTo: `demo://${toolName}`,
    toolInput,
    message: `Payment required before ${toolName} can run.`,
  };
}

function settlePayment(challenge) {
  return {
    paymentId: createId('payment'),
    challengeId: challenge.challengeId,
    toolName: challenge.toolName,
    amountUsd: challenge.amountUsd,
    currency: challenge.currency,
    status: 'settled-simulated',
    settledAt: new Date().toISOString(),
  };
}

function deliverToolResult({ challenge, paymentReceipt }) {
  const { location, window } = challenge.toolInput;
  const signalByScenario = {
    allowed: 'Low operational risk, isolated storm cells, no immediate escalation needed.',
    approval: 'Moderate operational risk, clustered storm cells, route planning adjustment recommended.',
    blocked: 'High operational risk, broad multi-county storm activity forecast, enterprise pack would normally return mitigation details.',
  };

  return {
    toolName: challenge.toolName,
    scenarioName: challenge.scenarioName,
    location,
    window,
    summary: signalByScenario[challenge.scenarioName] || 'Deterministic premium result returned.',
    dataSource: 'deterministic local paid-tool simulator',
    paymentId: paymentReceipt.paymentId,
    receiptStatus: paymentReceipt.status,
  };
}

module.exports = {
  requestPaidTool,
  settlePayment,
  deliverToolResult,
};
