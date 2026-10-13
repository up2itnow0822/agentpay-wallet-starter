#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { evaluatePayment, formatUsd, validatePolicy, isRecord, validAmount, validName } = require('./lib/policy');
const { requestApproval } = require('./lib/approval');
const { appendAuditEvent, writeRunSummary, ensureDir } = require('./lib/audit');
const simulator = require('./lib/paid-tool-simulator');

function defaultArgs() {
  return { scenario: 'allowed', configPath: path.join(__dirname, 'demo.config.json'), policyPath: null, auditDir: path.join(__dirname, 'artifacts') };
}

function parseCliArgs(argv, parsed) {
  let index = 0;
  if (argv[0] && !argv[0].startsWith('--')) { parsed.scenario = argv[0]; index++; }
  const flags = { '--config': 'configPath', '--policy': 'policyPath', '--audit-dir': 'auditDir' };
  const seen = new Set();
  let error;
  const reject = message => { error ??= new Error(message); };
  for (; index < argv.length; index++) {
    const flag = argv[index];
    if (!Object.hasOwn(flags, flag)) { reject(`Unknown or duplicate flag: ${flag}`); continue; }
    const duplicate = seen.has(flag);
    seen.add(flag);
    if (duplicate) reject(`Unknown or duplicate flag: ${flag}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) { reject(`Missing value for ${flag}`); continue; }
    index++;
    // Keep scanning after errors so a later audit destination can be retained.
    // A duplicate never changes the first destination, even when it was incomplete.
    if (!duplicate) parsed[flags[flag]] = path.resolve(value);
  }
  if (error) throw error;
  return parsed;
}

function parseArgs(argv) {
  return parseCliArgs(argv, defaultArgs());
}

function validateConfig(config, scenarioName) {
  if (!isRecord(config) || !isRecord(config.tool) || !validName(config.tool.name)) throw new Error('Config must define a valid tool name.');
  if (config.tool.currency !== 'USD' || config.tool.challengeScheme !== 'simulated-x402') throw new Error('This demo supports only USD simulated-x402 challenges.');
  validatePolicy(config.policy);
  if (!isRecord(config.scenarios) || !Object.hasOwn(config.scenarios, scenarioName)) throw new Error(`Unknown scenario: ${scenarioName}`);
  for (const [name, scenario] of Object.entries(config.scenarios)) {
    if (!isRecord(scenario) || !validAmount(scenario.amountUsd)) throw new Error(`Scenario ${name} requires a finite nonnegative numeric amountUsd.`);
    if (typeof scenario.goal !== 'string' || !scenario.goal.trim()) throw new Error(`Scenario ${name} requires goal text.`);
    if (!isRecord(scenario.toolInput) || !['location', 'window'].every(key => typeof scenario.toolInput[key] === 'string' && scenario.toolInput[key].trim())) throw new Error(`Scenario ${name} requires location and window tool input.`);
  }
  return config;
}

function createRunSummary(args) {
  return {
    runId: `run_${new Date().toISOString().replace(/[:.]/g, '-')}_${crypto.randomBytes(6).toString('hex')}`,
    scenario: args.scenario, startedAt: new Date().toISOString(), completedAt: null,
    toolName: null, amountUsd: null, goal: null, toolInput: null, policy: null,
    challenge: null, policyDecision: null, approvalDecision: { approved: null, mode: 'not_required', responder: 'system', reason: 'Approval was not required.' },
    paymentReceipt: null, toolResult: null, outcome: 'run_failed', error: null,
    auditLogPath: path.join(args.auditDir, 'audit-log.jsonl'),
  };
}

function failRun(args, summary, error) {
  summary.outcome = 'run_failed';
  summary.completedAt = new Date().toISOString();
  summary.error = { message: error.message };
  // Attempt both records even if one evidence write fails. Never settle again.
  const persistenceErrors = [];
  try { appendAuditEvent(args.auditDir, { eventType: 'run.failed', runId: summary.runId, outcome: summary.outcome, error: summary.error, policyDecision: summary.policyDecision, approvalDecision: summary.approvalDecision, paymentReceipt: summary.paymentReceipt }); } catch (failure) { persistenceErrors.push(failure); }
  try { writeRunSummary(args.auditDir, summary); } catch (failure) { persistenceErrors.push(failure); }
  if (persistenceErrors.length) throw new AggregateError([error, ...persistenceErrors], `Run failed and evidence could not be fully saved: ${error.message}; ${persistenceErrors.map(failure => failure.message).join('; ')}`);
  throw error;
}

async function runDemo(args, overrides = {}) {
  const dependencies = { ...simulator, requestApproval, log: console.log, ...overrides };
  const summary = createRunSummary(args);
  const emit = event => appendAuditEvent(args.auditDir, { ...event, runId: summary.runId });
  try {
    ensureDir(args.auditDir);
    const config = JSON.parse(fs.readFileSync(args.configPath, 'utf8'));
    if (args.policyPath) config.policy = JSON.parse(fs.readFileSync(args.policyPath, 'utf8'));
    validateConfig(config, args.scenario);
    const scenario = config.scenarios[args.scenario];
    Object.assign(summary, { toolName: config.tool.name, amountUsd: scenario.amountUsd, goal: scenario.goal, toolInput: scenario.toolInput, policy: config.policy });
    dependencies.log(`Controlled paid-tool simulation — ${args.scenario}: ${scenario.goal}`);
    emit({ eventType: 'agent.tool_requested', toolName: summary.toolName, scenario: args.scenario, goal: scenario.goal, toolInput: scenario.toolInput });
    summary.challenge = dependencies.requestPaidTool({ toolName: summary.toolName, scenarioName: args.scenario, amountUsd: scenario.amountUsd, toolInput: scenario.toolInput, challengeScheme: config.tool.challengeScheme });
    emit({ eventType: 'payment.challenge_received', challenge: summary.challenge });
    summary.policyDecision = evaluatePayment({ toolName: summary.challenge.toolName, amountUsd: summary.challenge.amountUsd }, config.policy);
    dependencies.log(`Policy: ${summary.policyDecision.decision}. ${summary.policyDecision.reason}`);
    emit({ eventType: 'policy.evaluated', policy: config.policy, decision: summary.policyDecision });
    summary.outcome = 'blocked_by_policy';
    if (summary.policyDecision.decision === 'approval_required') {
      summary.approvalDecision = await dependencies.requestApproval({ toolName: summary.challenge.toolName, amountUsd: summary.challenge.amountUsd, reason: summary.policyDecision.reason });
      emit({ eventType: 'approval.decided', approvalDecision: summary.approvalDecision });
      summary.outcome = 'approval_denied';
    }
    if (summary.policyDecision.decision === 'allowed' || (summary.policyDecision.decision === 'approval_required' && summary.approvalDecision.approved === true)) {
      summary.paymentReceipt = dependencies.settlePayment(summary.challenge);
      emit({ eventType: 'payment.settled', paymentReceipt: summary.paymentReceipt });
      summary.toolResult = dependencies.deliverToolResult({ challenge: summary.challenge, paymentReceipt: summary.paymentReceipt });
      emit({ eventType: 'tool.result_received', toolResult: summary.toolResult });
      summary.outcome = summary.policyDecision.decision === 'allowed' ? 'allowed_paid_and_completed' : 'approval_paid_and_completed';
      dependencies.log(`Simulated settlement: ${formatUsd(summary.amountUsd)}; receipt ${summary.paymentReceipt.paymentId}.`);
    }
    summary.completedAt = new Date().toISOString();
    emit({ eventType: 'run.completed', outcome: summary.outcome, policyDecision: summary.policyDecision, approvalDecision: summary.approvalDecision, paymentReceipt: summary.paymentReceipt });
    const paths = writeRunSummary(args.auditDir, summary);
    dependencies.log(`Outcome: ${summary.outcome}\nAudit log: ${summary.auditLogPath}\nRun summary: ${paths.latestPath}`);
    return summary;
  } catch (error) {
    failRun(args, summary, error);
  }
}

async function runCli(argv) {
  const args = defaultArgs();
  try { parseCliArgs(argv, args); } catch (error) { failRun(args, createRunSummary(args), error); }
  return runDemo(args);
}

if (require.main === module) {
  runCli(process.argv.slice(2)).catch(error => { console.error(`Demo failed: ${error.message}`); process.exitCode = 1; });
}
module.exports = { parseArgs, validateConfig, runDemo };
