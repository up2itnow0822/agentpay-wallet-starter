#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { evaluatePayment, formatUsd } = require('./lib/policy');
const { requestApproval } = require('./lib/approval');
const { appendAuditEvent, writeRunSummary, ensureDir } = require('./lib/audit');
const { requestPaidTool, settlePayment, deliverToolResult } = require('./lib/paid-tool-simulator');

function parseArgs(argv) {
  const parsed = {
    scenario: argv[0] || 'allowed',
    configPath: path.join(__dirname, 'demo.config.json'),
    auditDir: path.join(__dirname, 'artifacts'),
  };

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--config' && argv[index + 1]) {
      parsed.configPath = path.resolve(argv[index + 1]);
      index += 1;
    } else if (arg === '--audit-dir' && argv[index + 1]) {
      parsed.auditDir = path.resolve(argv[index + 1]);
      index += 1;
    }
  }

  return parsed;
}

function loadConfig(configPath) {
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function buildRunId() {
  return `run_${new Date().toISOString().replace(/[:.]/g, '-')}_${crypto.randomBytes(3).toString('hex')}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig(args.configPath);
  const scenario = config.scenarios[args.scenario];

  if (!scenario) {
    throw new Error(`Unknown scenario \"${args.scenario}\". Expected one of: ${Object.keys(config.scenarios).join(', ')}`);
  }

  ensureDir(args.auditDir);

  const runId = buildRunId();
  const runStartedAt = new Date().toISOString();
  const toolName = config.tool.name;

  console.log(`NemoClaw controlled paid tool demo`);
  console.log(`Scenario: ${args.scenario}`);
  console.log(`Goal: ${scenario.goal}`);
  console.log('');

  appendAuditEvent(args.auditDir, {
    runId,
    eventType: 'agent.tool_requested',
    toolName,
    scenario: args.scenario,
    goal: scenario.goal,
    toolInput: scenario.toolInput,
  });

  const challenge = requestPaidTool({
    toolName,
    scenarioName: args.scenario,
    amountUsd: scenario.amountUsd,
    toolInput: scenario.toolInput,
    challengeScheme: config.tool.challengeScheme,
  });

  console.log(`[1/5] Paid tool returned a payment challenge for ${formatUsd(challenge.amountUsd)}.`);
  appendAuditEvent(args.auditDir, {
    runId,
    eventType: 'payment.challenge_received',
    challenge,
  });

  const policyDecision = evaluatePayment(
    { toolName: challenge.toolName, amountUsd: challenge.amountUsd },
    config.policy
  );
  console.log(`[2/5] Policy decision: ${policyDecision.decision}. ${policyDecision.reason}`);
  appendAuditEvent(args.auditDir, {
    runId,
    eventType: 'policy.evaluated',
    policy: config.policy,
    decision: policyDecision,
  });

  let approvalDecision = {
    approved: null,
    mode: 'not_required',
    responder: 'system',
    reason: 'Approval was not required.',
  };
  let paymentReceipt = null;
  let toolResult = null;
  let outcome = 'blocked_by_policy';

  if (policyDecision.decision === 'blocked') {
    console.log(`[3/5] Payment blocked before settlement.`);
    appendAuditEvent(args.auditDir, {
      runId,
      eventType: 'run.completed',
      outcome,
      policyDecision,
    });
  } else {
    if (policyDecision.decision === 'approval_required') {
      console.log('[3/6] Human approval is required before payment can continue.');
      approvalDecision = await requestApproval({
        toolName: challenge.toolName,
        amountUsd: challenge.amountUsd,
        reason: policyDecision.reason,
      });
      console.log(`[4/6] Approval decision: ${approvalDecision.approved ? 'approved' : 'denied'} via ${approvalDecision.mode}.`);
      appendAuditEvent(args.auditDir, {
        runId,
        eventType: 'approval.decided',
        approvalDecision,
      });

      if (!approvalDecision.approved) {
        outcome = 'approval_denied';
        appendAuditEvent(args.auditDir, {
          runId,
          eventType: 'run.completed',
          outcome,
          policyDecision,
          approvalDecision,
        });
      }
    }

    if (policyDecision.decision === 'allowed' || approvalDecision.approved) {
      const progressLabel = policyDecision.decision === 'allowed' ? '[3/5]' : '[5/6]';
      paymentReceipt = settlePayment(challenge);
      console.log(`${progressLabel} Payment settled in simulated mode with receipt ${paymentReceipt.paymentId}.`);
      appendAuditEvent(args.auditDir, {
        runId,
        eventType: 'payment.settled',
        paymentReceipt,
      });

      toolResult = deliverToolResult({ challenge, paymentReceipt });
      outcome = policyDecision.decision === 'allowed' ? 'allowed_paid_and_completed' : 'approval_paid_and_completed';
      const resultLabel = policyDecision.decision === 'allowed' ? '[4/5]' : '[6/6]';
      console.log(`${resultLabel} Paid tool returned result: ${toolResult.summary}`);
      appendAuditEvent(args.auditDir, {
        runId,
        eventType: 'tool.result_received',
        toolResult,
      });
      appendAuditEvent(args.auditDir, {
        runId,
        eventType: 'run.completed',
        outcome,
        policyDecision,
        approvalDecision,
        paymentReceipt,
      });
    }
  }

  const summary = {
    runId,
    scenario: args.scenario,
    startedAt: runStartedAt,
    completedAt: new Date().toISOString(),
    toolName,
    amountUsd: scenario.amountUsd,
    goal: scenario.goal,
    toolInput: scenario.toolInput,
    policy: config.policy,
    challenge,
    policyDecision,
    approvalDecision,
    paymentReceipt,
    toolResult,
    outcome,
    auditLogPath: path.join(args.auditDir, 'audit-log.jsonl'),
  };

  const summaryPaths = writeRunSummary(args.auditDir, summary);
  console.log('');
  console.log(`Outcome: ${outcome}`);
  console.log(`Audit log: ${summary.auditLogPath}`);
  console.log(`Run summary: ${summaryPaths.latestPath}`);
}

main().catch((error) => {
  console.error(`Demo failed: ${error.message}`);
  process.exit(1);
});
