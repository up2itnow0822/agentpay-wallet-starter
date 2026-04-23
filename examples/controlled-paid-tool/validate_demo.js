#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');

const exampleDir = __dirname;
const runDemoPath = path.join(exampleDir, 'run_demo.js');
const validationDir = path.join(exampleDir, 'artifacts', 'validation');

const cases = [
  {
    name: 'allowed',
    expectedOutcome: 'allowed_paid_and_completed',
    env: {},
  },
  {
    name: 'approval',
    expectedOutcome: 'approval_paid_and_completed',
    env: { NEMOCLAW_AUTO_APPROVE: 'yes' },
  },
  {
    name: 'blocked',
    expectedOutcome: 'blocked_by_policy',
    env: {},
  },
];

function runCase(testCase) {
  const auditDir = path.join(validationDir, testCase.name);
  fs.rmSync(auditDir, { recursive: true, force: true });
  fs.mkdirSync(auditDir, { recursive: true });

  const command = `${testCase.env.NEMOCLAW_AUTO_APPROVE ? `NEMOCLAW_AUTO_APPROVE=${testCase.env.NEMOCLAW_AUTO_APPROVE} ` : ''}${process.execPath} ${runDemoPath} ${testCase.name} --audit-dir ${auditDir}`;
  const result = spawnSync(process.execPath, [runDemoPath, testCase.name, '--audit-dir', auditDir], {
    cwd: exampleDir,
    env: { ...process.env, ...testCase.env },
    encoding: 'utf8',
  });

  fs.writeFileSync(path.join(auditDir, 'stdout.txt'), result.stdout || '', 'utf8');
  fs.writeFileSync(path.join(auditDir, 'stderr.txt'), result.stderr || '', 'utf8');

  assert.strictEqual(result.status, 0, `${testCase.name} exited with status ${result.status}: ${result.stderr}`);

  const summaryPath = path.join(auditDir, 'latest-run.json');
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  assert.strictEqual(summary.outcome, testCase.expectedOutcome, `${testCase.name} outcome mismatch`);

  return {
    scenario: testCase.name,
    expectedOutcome: testCase.expectedOutcome,
    actualOutcome: summary.outcome,
    command,
    summaryPath,
    auditLogPath: summary.auditLogPath,
    stdoutPath: path.join(auditDir, 'stdout.txt'),
    stderrPath: path.join(auditDir, 'stderr.txt'),
  };
}

function main() {
  fs.rmSync(validationDir, { recursive: true, force: true });
  fs.mkdirSync(validationDir, { recursive: true });

  const results = cases.map(runCase);
  const summary = {
    validatedAt: new Date().toISOString(),
    results,
  };

  const summaryPath = path.join(validationDir, 'validation-summary.json');
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  console.log('Validation passed for allowed, approval-required, and blocked scenarios.');
  console.log(`Validation summary: ${summaryPath}`);
}

main();
