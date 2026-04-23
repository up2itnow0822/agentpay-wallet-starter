const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');

function parseEnvApproval(value) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'approve', 'approved'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'deny', 'denied'].includes(normalized)) {
    return false;
  }
  return null;
}

async function requestApproval({ toolName, amountUsd, reason }) {
  const envDecision = parseEnvApproval(process.env.NEMOCLAW_AUTO_APPROVE);
  if (envDecision !== null) {
    return {
      approved: envDecision,
      mode: 'environment',
      responder: 'NEMOCLAW_AUTO_APPROVE',
      reason: envDecision
        ? 'Approval granted by NEMOCLAW_AUTO_APPROVE.'
        : 'Approval denied by NEMOCLAW_AUTO_APPROVE.',
    };
  }

  if (!stdin.isTTY || !stdout.isTTY) {
    return {
      approved: false,
      mode: 'non_interactive_default_deny',
      responder: 'system',
      reason: 'Approval was required, but no interactive terminal was available and NEMOCLAW_AUTO_APPROVE was not set.',
    };
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(
      `Approval required for ${toolName} at $${amountUsd.toFixed(2)}. ${reason} Approve payment? [y/N] `
    );
    const approved = answer.trim().toLowerCase().startsWith('y');
    return {
      approved,
      mode: 'terminal_prompt',
      responder: 'human',
      reason: approved ? 'Human approved payment in terminal.' : 'Human denied payment in terminal.',
    };
  } finally {
    rl.close();
  }
}

module.exports = {
  requestApproval,
};
