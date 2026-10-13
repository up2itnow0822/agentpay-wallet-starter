const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { evaluatePayment } = require('../examples/controlled-paid-tool/lib/policy');
const { parseTerminalApproval } = require('../examples/controlled-paid-tool/lib/approval');
const { parseArgs, runDemo } = require('../examples/controlled-paid-tool/run_demo');

const example = path.resolve(__dirname, '../examples/controlled-paid-tool');
const config = () => JSON.parse(fs.readFileSync(path.join(example, 'demo.config.json'), 'utf8'));
const request = () => ({ toolName: 'premium_weather_signal', amountUsd: 0.18 });
function workspace(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'starter-simulator-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function cliArgs(args, approval = '') {
  return spawnSync(process.execPath, [path.join(example, 'run_demo.js'), ...args], { encoding: 'utf8', env: { ...process.env, NEMOCLAW_AUTO_APPROVE: approval } });
}
function cli(directory, scenario, flags = [], approval = '') {
  return cliArgs([scenario, '--audit-dir', directory, ...flags], approval);
}
function events(directory) {
  return fs.readFileSync(path.join(directory, 'audit-log.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
}

test('malformed request amounts and policies fail closed without throwing', () => {
  for (const value of [undefined, null, -1, NaN, Infinity, Number.MAX_VALUE, '0.18', {}, []]) {
    assert.equal(evaluatePayment({ ...request(), amountUsd: value }, config().policy).decision, 'blocked');
  }
  for (const value of [null, {}, { ...config().policy, allowedTools: 'premium_weather_signal' }, { ...config().policy, allowedTools: [null] }, { ...config().policy, hardCapUsd: null }, { ...config().policy, hardCapUsd: -1 }, { ...config().policy, hardCapUsd: Infinity }, { ...config().policy, approvalThresholdUsd: '0.25' }, { ...config().policy, approvalThresholdUsd: 2 }]) {
    assert.equal(evaluatePayment(request(), value).decision, 'blocked');
  }
  assert.equal(evaluatePayment(request(), { ...config().policy, allowedTools: [] }).decision, 'blocked');
});

test('threshold and hard-cap equality have exact allowed/approval behavior', () => {
  for (const [amountUsd, expected] of [[0.25, 'allowed'], [0.250001, 'approval_required'], [1, 'approval_required'], [1.000001, 'blocked']]) {
    assert.equal(evaluatePayment({ ...request(), amountUsd }, config().policy).decision, expected);
  }
  assert.equal(evaluatePayment({ ...request(), toolName: 'weather' }, config().policy).decision, 'blocked');
});

test('unknown and inherited scenario names fail before a challenge or settlement', t => {
  for (const scenario of ['constructor', 'toString', '__proto__', 'missing']) {
    const directory = path.join(workspace(t), scenario);
    const result = cli(directory, scenario);
    assert.equal(result.status, 1);
    const history = events(directory);
    assert(!history.some(e => ['payment.challenge_received', 'payment.settled'].includes(e.eventType)));
    assert.equal(history.at(-1).eventType, 'run.failed');
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'latest-run.json'))).outcome, 'run_failed');
  }
});

test('invalid configuration is rejected before any simulated financial side effect', t => {
  const mutations = [
    value => { value.scenarios.allowed.amountUsd = null; },
    value => { value.policy.allowedTools = 'premium_weather_signal'; },
    value => { value.policy.hardCapUsd = null; },
    value => { delete value.scenarios.allowed.toolInput; },
    value => { value.tool.challengeScheme = 'live-x402'; },
    value => { value.tool.currency = 'ETH'; },
  ];
  for (const mutate of mutations) {
    const directory = workspace(t);
    const value = config(); mutate(value);
    const file = path.join(directory, 'config.json'); fs.writeFileSync(file, JSON.stringify(value));
    assert.equal(cli(directory, 'allowed', ['--config', file]).status, 1);
    assert(!events(directory).some(e => e.eventType === 'payment.settled'));
  }
});

test('the explicit policy file is authoritative rather than a decorative example', t => {
  const directory = workspace(t);
  const policyFile = path.join(directory, 'deny.json');
  fs.writeFileSync(policyFile, JSON.stringify({ ...config().policy, allowedTools: [] }));
  assert.equal(cli(directory, 'allowed', ['--policy', policyFile]).status, 0);
  const summary = JSON.parse(fs.readFileSync(path.join(directory, 'latest-run.json')));
  assert.equal(summary.outcome, 'blocked_by_policy');
  assert.deepEqual(summary.policy.allowedTools, []);
  assert.equal(summary.paymentReceipt, null);
  assert(!events(directory).some(e => e.eventType === 'payment.settled'));
});

test('approval denial and missing or unrecognized noninteractive approval do not settle', t => {
  for (const approval of ['no', '', 'probably']) {
    const directory = workspace(t);
    assert.equal(cli(directory, 'approval', [], approval).status, 0);
    const summary = JSON.parse(fs.readFileSync(path.join(directory, 'latest-run.json')));
    assert.equal(summary.outcome, 'approval_denied');
    assert.equal(summary.approvalDecision.approved, false);
    assert.equal(summary.paymentReceipt, null);
    assert(!events(directory).some(e => e.eventType === 'payment.settled'));
  }
});

test('terminal approval accepts exact y or yes, never an arbitrary y prefix', () => {
  for (const value of ['y', ' yes ', 'YES']) assert.equal(parseTerminalApproval(value), true);
  for (const value of ['yesterday', 'yeah-no', '', 'no', null]) assert.equal(parseTerminalApproval(value), false);
});

test('argument parsing rejects unknown, duplicate and missing-value flags', () => {
  assert.equal(typeof parseArgs, 'function');
  for (const args of [['allowed', '--unknown'], ['allowed', '--config'], ['allowed', '--audit-dir', '--config', 'a'], ['allowed', '--policy'], ['allowed', '--config', 'a', '--config', 'b']]) {
    assert.throws(() => parseArgs(args));
  }
});

for (const { name, args, error } of [
  { name: 'unknown flag after the audit directory', args: directory => ['allowed', '--audit-dir', directory, '--config', path.join(directory, 'missing.json'), '--unknown'], error: /Unknown or duplicate flag: --unknown/ },
  { name: 'unknown flag before the audit directory', args: directory => ['allowed', '--unknown', '--audit-dir', directory, '--config', path.join(directory, 'missing.json')], error: /Unknown or duplicate flag: --unknown/ },
  { name: 'duplicate flag after the audit directory', args: directory => ['allowed', '--audit-dir', directory, '--config', path.join(directory, 'missing.json'), '--config', 'other.json'], error: /Unknown or duplicate flag: --config/ },
  { name: 'duplicate flag before the audit directory', args: directory => ['allowed', '--config', 'missing.json', '--config', 'other.json', '--audit-dir', directory], error: /Unknown or duplicate flag: --config/ },
  { name: 'missing value after the audit directory', args: directory => ['allowed', '--audit-dir', directory, '--config'], error: /Missing value for --config/ },
  { name: 'missing value before the audit directory', args: directory => ['allowed', '--policy', '--audit-dir', directory], error: /Missing value for --policy/ },
]) {
  test(`CLI ${name} replaces a seeded success with failed run evidence`, t => {
    const directory = workspace(t);
    assert.equal(cli(directory, 'allowed').status, 0);
    const previous = JSON.parse(fs.readFileSync(path.join(directory, 'latest-run.json')));
    assert.equal(previous.outcome, 'allowed_paid_and_completed');

    const result = cliArgs(args(directory));
    assert.equal(result.status, 1);
    assert.match(result.stderr, error);
    const summary = JSON.parse(fs.readFileSync(path.join(directory, 'latest-run.json')));
    assert.notEqual(summary.runId, previous.runId);
    assert.equal(summary.outcome, 'run_failed');
    assert.match(summary.error.message, error);
    assert.equal(summary.toolName, null);
    assert.equal(summary.challenge, null);
    assert.equal(summary.paymentReceipt, null);
    assert.equal(summary.toolResult, null);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, `${summary.runId}.json`))), summary);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, `${previous.runId}.json`))), previous);
    const history = events(directory);
    assert.equal(history.at(-1).runId, summary.runId);
    assert.equal(history.at(-1).eventType, 'run.failed');
    assert.deepEqual(history.at(-1).error, summary.error);
    assert.deepEqual(history.filter(event => event.runId === summary.runId).map(event => event.eventType), ['run.failed']);
  });
}

test('duplicate audit directories fail in the first destination without selecting the second', t => {
  const directory = workspace(t);
  const secondDirectory = path.join(directory, 'second-destination');
  assert.equal(cli(directory, 'allowed').status, 0);
  const previous = JSON.parse(fs.readFileSync(path.join(directory, 'latest-run.json')));

  const result = cli(directory, 'allowed', ['--audit-dir', secondDirectory]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown or duplicate flag: --audit-dir/);
  const summary = JSON.parse(fs.readFileSync(path.join(directory, 'latest-run.json')));
  assert.notEqual(summary.runId, previous.runId);
  assert.equal(summary.outcome, 'run_failed');
  assert.match(summary.error.message, /Unknown or duplicate flag: --audit-dir/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, `${summary.runId}.json`))), summary);
  const history = events(directory).filter(event => event.runId === summary.runId);
  assert.deepEqual(history.map(event => event.eventType), ['run.failed']);
  assert.equal(fs.existsSync(secondDirectory), false);
});

test('CLI argument failures report evidence persistence errors loudly', t => {
  const directory = workspace(t);
  assert.equal(cli(directory, 'allowed').status, 0);
  const previous = JSON.parse(fs.readFileSync(path.join(directory, 'latest-run.json')));
  const auditLog = path.join(directory, 'audit-log.jsonl');
  fs.renameSync(auditLog, path.join(directory, 'previous-audit-log.jsonl'));
  fs.mkdirSync(auditLog);

  const result = cli(directory, 'allowed', ['--unknown']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /evidence could not be fully saved/);
  assert.match(result.stderr, /Unknown or duplicate flag: --unknown/);
  const summary = JSON.parse(fs.readFileSync(path.join(directory, 'latest-run.json')));
  assert.notEqual(summary.runId, previous.runId);
  assert.equal(summary.outcome, 'run_failed');
  assert.equal(summary.challenge, null);
  assert.equal(summary.paymentReceipt, null);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, `${summary.runId}.json`))), summary);
});

test('failure after settlement replaces the latest success and preserves a terminal failure and receipt', async t => {
  const directory = workspace(t);
  assert.equal(cli(directory, 'allowed').status, 0);
  const oldSummary = JSON.parse(fs.readFileSync(path.join(directory, 'latest-run.json')));
  await assert.rejects(runDemo(parseArgs(['allowed', '--audit-dir', directory]), {
    deliverToolResult: () => { throw new Error('Injected delivery failure'); }, log: () => {},
  }), /Injected delivery failure/);
  const summary = JSON.parse(fs.readFileSync(path.join(directory, 'latest-run.json')));
  assert.notEqual(summary.runId, oldSummary.runId);
  assert.equal(summary.outcome, 'run_failed');
  assert.match(summary.error.message, /Injected delivery failure/);
  assert.equal(summary.paymentReceipt.status, 'settled-simulated');
  assert.equal(summary.toolResult, null);
  const history = events(directory).filter(e => e.runId === summary.runId);
  assert.equal(history.at(-1).eventType, 'run.failed');
  assert.deepEqual(history.at(-1).paymentReceipt, summary.paymentReceipt);
  assert.equal(history.filter(e => e.eventType === 'payment.settled').length, 1);
  assert(!history.some(e => e.eventType === 'run.completed'));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, `${summary.runId}.json`))), summary);
});
