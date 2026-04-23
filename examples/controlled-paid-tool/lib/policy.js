function formatUsd(amount) {
  return `$${Number(amount).toFixed(2)}`;
}

function evaluatePayment({ toolName, amountUsd }, policy) {
  if (!policy.allowedTools.includes(toolName)) {
    return {
      decision: 'blocked',
      reason: `Tool ${toolName} is not in the allowed tool list.`,
      amountUsd,
      toolName,
    };
  }

  if (amountUsd > policy.hardCapUsd) {
    return {
      decision: 'blocked',
      reason: `${formatUsd(amountUsd)} exceeds the hard cap of ${formatUsd(policy.hardCapUsd)}.`,
      amountUsd,
      toolName,
    };
  }

  if (amountUsd > policy.approvalThresholdUsd) {
    return {
      decision: 'approval_required',
      reason: `${formatUsd(amountUsd)} is above the auto-allow threshold of ${formatUsd(policy.approvalThresholdUsd)} and within the hard cap.`,
      amountUsd,
      toolName,
    };
  }

  return {
    decision: 'allowed',
    reason: `${formatUsd(amountUsd)} is within the auto-allow threshold of ${formatUsd(policy.approvalThresholdUsd)}.`,
    amountUsd,
    toolName,
  };
}

module.exports = {
  evaluatePayment,
  formatUsd,
};
