#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const validationDir = path.join(__dirname, 'artifacts', 'validation');
const cases = [
  { name: 'allowed', scenario: 'allowed', outcome: 'allowed_paid_and_completed', decision: 'allowed', paid: true },
  { name: 'approval', scenario: 'approval', outcome: 'approval_paid_and_completed', decision: 'approval_required', approval: true, approvalMode: 'environment', approvalEnv: 'yes', paid: true },
  { name: 'blocked', scenario: 'blocked', outcome: 'blocked_by_policy', decision: 'blocked', paid: false },
  { name: 'approval-denied', scenario: 'approval', outcome: 'approval_denied', decision: 'approval_required', approval: false, approvalMode: 'environment', approvalEnv: 'no', paid: false },
  { name: 'approval-unset', scenario: 'approval', outcome: 'approval_denied', decision: 'approval_required', approval: false, approvalMode: 'non_interactive_default_deny', paid: false },
  { name: 'approval-invalid', scenario: 'approval', outcome: 'approval_denied', decision: 'approval_required', approval: false, approvalMode: 'non_interactive_default_deny', approvalEnv: 'probably', paid: false },
];

function assertEvidence(summary, history, expected) {
  assert.equal(summary.outcome, expected.outcome, `${expected.name}: outcome`);
  assert.equal(summary.scenario, expected.scenario);
  assert.equal(summary.error, null);
  assert.equal(summary.policyDecision.decision, expected.decision, `${expected.name}: policy decision`);
  assert.equal(summary.policyDecision.toolName, summary.toolName);
  assert.equal(summary.policyDecision.amountUsd, summary.amountUsd);
  assert.equal(summary.challenge.status, 402);
  assert.equal(summary.challenge.toolName, summary.toolName);
  assert.equal(summary.challenge.scenarioName, summary.scenario);
  assert.equal(summary.challenge.amountUsd, summary.amountUsd);
  assert.equal(summary.challenge.currency, 'USD');
  assert.equal(summary.challenge.challengeScheme, 'simulated-x402');
  assert.deepEqual(summary.challenge.toolInput, summary.toolInput);
  assert.match(summary.challenge.challengeId, /^challenge_[a-f0-9]+$/);
  assert(Number.isFinite(Date.parse(summary.startedAt)));
  assert(Date.parse(summary.completedAt) >= Date.parse(summary.startedAt));

  const sequence = ['agent.tool_requested', 'payment.challenge_received', 'policy.evaluated'];
  if (expected.decision === 'approval_required') {
    sequence.push('approval.decided');
    assert.equal(summary.approvalDecision.approved, expected.approval, `${expected.name}: approval`);
    assert.equal(summary.approvalDecision.mode, expected.approvalMode);
  } else {
    assert.equal(summary.approvalDecision.approved, null);
    assert.equal(summary.approvalDecision.mode, 'not_required');
  }
  if (expected.paid) {
    sequence.push('payment.settled', 'tool.result_received');
    const receipt = summary.paymentReceipt;
    assert.match(receipt.paymentId, /^payment_[a-f0-9]+$/);
    assert.equal(receipt.challengeId, summary.challenge.challengeId);
    assert.equal(receipt.toolName, summary.toolName);
    assert.equal(receipt.amountUsd, summary.amountUsd);
    assert.equal(receipt.currency, 'USD');
    assert.equal(receipt.status, 'settled-simulated');
    assert(Number.isFinite(Date.parse(receipt.settledAt)));
    assert.equal(summary.toolResult.paymentId, receipt.paymentId);
    assert.equal(summary.toolResult.receiptStatus, receipt.status);
    assert.equal(summary.toolResult.toolName, summary.toolName);
    assert.equal(summary.toolResult.scenarioName, summary.scenario);
    assert.equal(summary.toolResult.location, summary.toolInput.location);
    assert.equal(summary.toolResult.window, summary.toolInput.window);
    assert.equal(typeof summary.toolResult.summary, 'string');
    assert(summary.toolResult.summary.length > 0);
    assert.equal(summary.toolResult.dataSource, 'deterministic local paid-tool simulator');
  } else {
    assert.equal(summary.paymentReceipt, null, `${expected.name}: forbidden receipt`);
    assert.equal(summary.toolResult, null, `${expected.name}: forbidden result`);
  }
  sequence.push('run.completed');
  assert.deepEqual(history.map(event => event.eventType), sequence, `${expected.name}: audit order and forbidden effects`);
  for (const event of history) {
    assert.equal(event.runId, summary.runId);
    assert(Number.isFinite(Date.parse(event.timestamp)));
  }
  const byType = name => history.find(event => event.eventType === name);
  assert.equal(byType('agent.tool_requested').toolName, summary.toolName);
  assert.deepEqual(byType('agent.tool_requested').toolInput, summary.toolInput);
  assert.deepEqual(byType('payment.challenge_received').challenge, summary.challenge);
  assert.deepEqual(byType('policy.evaluated').policy, summary.policy);
  assert.deepEqual(byType('policy.evaluated').decision, summary.policyDecision);
  if (expected.decision === 'approval_required') assert.deepEqual(byType('approval.decided').approvalDecision, summary.approvalDecision);
  if (expected.paid) {
    assert.deepEqual(byType('payment.settled').paymentReceipt, summary.paymentReceipt);
    assert.deepEqual(byType('tool.result_received').toolResult, summary.toolResult);
  }
  const terminal = history.at(-1);
  assert.equal(terminal.outcome, summary.outcome);
  assert.deepEqual(terminal.policyDecision, summary.policyDecision);
  assert.deepEqual(terminal.approvalDecision, summary.approvalDecision);
  assert.deepEqual(terminal.paymentReceipt, summary.paymentReceipt);
}

function runCase(expected, runDirectory) {
  const auditDir = path.join(runDirectory, expected.name);
  fs.mkdirSync(auditDir, { recursive: true });
  const args = [path.join(__dirname, 'run_demo.js'), expected.scenario, '--audit-dir', auditDir];
  const result = spawnSync(process.execPath, args, { cwd: __dirname, env: { ...process.env, NEMOCLAW_AUTO_APPROVE: expected.approvalEnv ?? '' }, encoding: 'utf8', timeout: 10000 });
  fs.writeFileSync(path.join(auditDir, 'stdout.txt'), result.stdout ?? '');
  fs.writeFileSync(path.join(auditDir, 'stderr.txt'), result.stderr ?? '');
  assert.equal(result.error, undefined, `${expected.name}: process error`);
  assert.equal(result.status, 0, `${expected.name}: exited ${result.status}: ${result.stderr}`);
  const summaryPath = path.join(auditDir, 'latest-run.json');
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  assert.equal(summary.auditLogPath, path.join(auditDir, 'audit-log.jsonl'));
  const history = fs.readFileSync(summary.auditLogPath, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assertEvidence(summary, history, expected);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(auditDir, `${summary.runId}.json`), 'utf8')), summary, `${expected.name}: per-run summary`);
  return { scenario: expected.name, expectedOutcome: expected.outcome, actualOutcome: summary.outcome, command: [process.execPath, ...args], summaryPath, auditLogPath: summary.auditLogPath };
}

function main() {
  fs.mkdirSync(validationDir, { recursive: true });
  const runDirectory = fs.mkdtempSync(path.join(validationDir, 'check-'));
  const results = cases.map(expected => runCase(expected, runDirectory));
  const summaryPath = path.join(runDirectory, 'validation-summary.json');
  fs.writeFileSync(summaryPath, `${JSON.stringify({ validatedAt: new Date().toISOString(), results }, null, 2)}\n`);
  console.log(`Validated ${cases.length} no-funds scenarios with approval, receipt and ordered audit assertions.`);
  console.log(`Validation summary: ${summaryPath}`);
}

if (require.main === module) main();
module.exports = { assertEvidence, main };
