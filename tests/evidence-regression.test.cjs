const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const example = path.resolve(__dirname, '../examples/controlled-paid-tool');
const mutations = [
  {
    name: 'blocked settlement hidden behind a correct outcome label', file: 'run_demo.js',
    mutate: source => source.replace("if (summary.policyDecision.decision === 'allowed' || (summary.policyDecision.decision === 'approval_required' && summary.approvalDecision.approved === true)) {", 'if (true) {')
      .replace("summary.outcome = summary.policyDecision.decision === 'allowed' ? 'allowed_paid_and_completed' : 'approval_paid_and_completed';", "summary.outcome = summary.policyDecision.decision === 'blocked' ? 'blocked_by_policy' : summary.policyDecision.decision === 'approval_required' && summary.approvalDecision.approved !== true ? 'approval_denied' : summary.policyDecision.decision === 'allowed' ? 'allowed_paid_and_completed' : 'approval_paid_and_completed';"),
  },
  { name: 'missing audit events', file: 'lib/audit.js', mutate: source => source.replace(/  fs\.appendFileSync\(auditLogPath,[^\n]+\n/u, '  // Deliberately disable audit writes for regression verification.\n') },
  { name: 'approval always succeeds', file: 'lib/approval.js', mutate: source => source.replace('async function requestApproval({ toolName, amountUsd, reason }) {', "async function requestApproval({ toolName, amountUsd, reason }) {\n  return { approved: true, mode: 'environment', responder: 'test', reason: 'Incorrect unconditional approval' };") },
];

for (const mutation of mutations) test(`canonical evidence validator detects ${mutation.name}`, t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'starter-evidence-mutation-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.cpSync(example, directory, { recursive: true, filter: source => !source.split(path.sep).includes('artifacts') });
  const file = path.join(directory, mutation.file);
  const source = fs.readFileSync(file, 'utf8');
  const broken = mutation.mutate(source);
  assert.notEqual(broken, source, 'Mutation must actually alter the executable boundary.');
  fs.writeFileSync(file, broken);
  const result = spawnSync(process.execPath, [path.join(directory, 'validate_demo.js')], { encoding: 'utf8', env: { ...process.env, NEMOCLAW_AUTO_APPROVE: 'yes' }, timeout: 15000 });
  assert.equal(result.error, undefined, 'Mutation should fail assertions, not time out.');
  assert.notEqual(result.status, 0, `${mutation.name} incorrectly passed verification: ${result.stdout}`);
  assert.match(result.stderr, /AssertionError|ENOENT/, 'A behavioral evidence assertion must detect the mutation.');
});

test('concurrent evidence validators retain isolated audit histories', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'starter-concurrent-verification-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.cpSync(example, directory, { recursive: true, filter: source => !source.split(path.sep).includes('artifacts') });
  const check = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(directory, 'validate_demo.js')], { env: { ...process.env, NEMOCLAW_AUTO_APPROVE: '' } });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject);
    child.on('close', status => resolve({ status, stdout, stderr }));
  });
  const results = await Promise.all([check(), check()]);
  for (const result of results) assert.equal(result.status, 0, result.stderr);
  const paths = results.map(result => /Validation summary: (.+)/.exec(result.stdout)[1]);
  assert.notEqual(paths[0], paths[1], 'Each verifier needs its own retained summary and evidence.');
  for (const file of paths) assert.equal(JSON.parse(fs.readFileSync(file)).results.length, 6);
});
