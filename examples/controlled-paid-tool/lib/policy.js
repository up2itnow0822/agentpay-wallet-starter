function formatUsd(amount) {
  return `$${Number(amount).toFixed(2)}`;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validAmount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
}

function validName(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128 && !/[\x00-\x1f\x7f]/.test(value);
}

function validatePolicy(policy) {
  if (!isRecord(policy) || !Array.isArray(policy.allowedTools) || !policy.allowedTools.every(validName)) throw new Error('Policy allowedTools must be an array of tool names.');
  if (!validAmount(policy.hardCapUsd) || !validAmount(policy.approvalThresholdUsd) || policy.approvalThresholdUsd > policy.hardCapUsd) throw new Error('Policy requires finite nonnegative numeric limits with approval threshold <= hard cap.');
  return policy;
}

function evaluatePayment(request, policy) {
  const { toolName, amountUsd } = isRecord(request) ? request : {};
  const blocked = reason => ({ decision: 'blocked', reason, amountUsd, toolName });
  if (!validName(toolName) || !validAmount(amountUsd)) return blocked('Malformed payment request: require a tool name and finite nonnegative numeric amount.');
  try { validatePolicy(policy); } catch (error) { return blocked(`Malformed payment policy: ${error.message}`); }
  if (!policy.allowedTools.includes(toolName)) {
    return blocked(`Tool ${toolName} is not in the allowed tool list.`);
  }

  if (amountUsd > policy.hardCapUsd) {
    return blocked(`${formatUsd(amountUsd)} exceeds the hard cap of ${formatUsd(policy.hardCapUsd)}.`);
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
  validatePolicy,
  isRecord,
  validAmount,
  validName,
};
