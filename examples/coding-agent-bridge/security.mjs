import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DAY_MS = 86_400_000;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
export const ALLOWED_TOOLS = Object.freeze(['get_wallet_info', 'x402_pay']);
export const X402_PROTOCOL_FEE_BPS = 77n;
export const X402_PROTOCOL_FEE_DENOMINATOR = 10_000n;
export const X402_PROTOCOL_FEE_COLLECTOR = '0xff86829393C6C26A4EC122bE0Cc3E466Ef876AdD';

/** @typedef {{allowedEndpoints: readonly string[], allowedRecipients: readonly string[], maxUsdcPerTx: string, maxUsdcPerDay: string, approvalThresholdUsdc: string}} BridgePolicy */
/** @typedef {'mock' | 'live'} BridgeMode */
/** @typedef {{toolName: string, endpoint: string, mode: BridgeMode, maxUsdc: string, maxPrincipalUsdc: string, maxProtocolFeeUsdc: string, protocolFeeRecipient: string | null, allowedRecipients: readonly string[]}} ApprovalRequest */

export class PaymentPolicyError extends Error {
  constructor(message) { super(message); this.name = 'PaymentPolicyError'; }
}

function reject(message) { throw new PaymentPolicyError(message); }
function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function amount(value, label) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,8})(?:\.\d{1,6})?$/.test(value)) reject(`${label} must be a decimal USDC string with at most six decimals.`);
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
}

function validateMode(mode) {
  if (mode !== 'mock' && mode !== 'live') reject('Bridge mode must be mock or live.');
}

function decimalUsdc(micros) {
  const whole = micros / 1_000_000n;
  const fraction = (micros % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function protocolFeeAmount(principalMicros) {
  return (principalMicros * X402_PROTOCOL_FEE_BPS) / X402_PROTOCOL_FEE_DENOMINATOR;
}

/** Translate a total wallet-debit bound into the pinned client's principal cap.
 * @param {string} maxUsdc
 * @param {BridgeMode} mode
 */
export function paymentBounds(maxUsdc, mode = 'mock') {
  validateMode(mode);
  const limit = amount(maxUsdc, 'max_payment_eth');
  let principalMicros = limit;
  if (mode === 'live') {
    let low = 0n;
    let high = limit;
    while (low < high) {
      const candidate = (low + high + 1n) / 2n;
      if (candidate + protocolFeeAmount(candidate) <= limit) low = candidate;
      else high = candidate - 1n;
    }
    principalMicros = low;
  }
  const protocolFeeMicros = mode === 'live' ? protocolFeeAmount(principalMicros) : 0n;
  return Object.freeze({ mode, maxUsdc, maxPrincipalUsdc: decimalUsdc(principalMicros), maxProtocolFeeUsdc: decimalUsdc(protocolFeeMicros), limit, principalMicros, protocolFeeMicros });
}

function endpoint(value) {
  if (typeof value !== 'string' || /[\s\x00-\x1f\x7f]/.test(value)) reject('Endpoint must be an absolute HTTPS URL without whitespace.');
  let url;
  try { url = new URL(value); } catch { reject('Endpoint must be an absolute HTTPS URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) reject('Endpoint must use HTTPS without credentials or a fragment.');
  return url.href;
}

/** @returns {Readonly<BridgePolicy>} */
export function validateBridgePolicy(value) {
  if (!record(value)) reject('A bridge policy is required.');
  for (const key of ['allowedEndpoints', 'allowedRecipients']) {
    if (!Array.isArray(value[key]) || value[key].length === 0 || value[key].length > 100) reject(`${key} must be a nonempty allowlist.`);
  }
  const endpoints = value.allowedEndpoints.map(endpoint);
  const recipients = value.allowedRecipients.map(v => {
    if (typeof v !== 'string' || !ADDRESS.test(v) || /^0x0{40}$/i.test(v)) reject('Every allowed recipient must be a nonzero EVM address.');
    return v.toLowerCase();
  });
  const perTx = amount(value.maxUsdcPerTx, 'maxUsdcPerTx');
  const perDay = amount(value.maxUsdcPerDay, 'maxUsdcPerDay');
  const approval = amount(value.approvalThresholdUsdc, 'approvalThresholdUsdc');
  if (perTx <= 0n || perDay < perTx || approval > perTx) reject('Require 0 < per-transaction cap <= daily cap and approval threshold <= per-transaction cap.');
  if (perDay * 1000n > BigInt(Number.MAX_SAFE_INTEGER)) reject('Daily cap exceeds the pinned server policy engine safe integer range.');
  return Object.freeze({ allowedEndpoints: Object.freeze([...new Set(endpoints)]), allowedRecipients: Object.freeze([...new Set(recipients)]), maxUsdcPerTx: value.maxUsdcPerTx, maxUsdcPerDay: value.maxUsdcPerDay, approvalThresholdUsdc: value.approvalThresholdUsdc });
}

/** @returns {Readonly<BridgePolicy>} */
export function validateLivePolicy(value) {
  const policy = validateBridgePolicy(value);
  if (!policy.allowedRecipients.includes(X402_PROTOCOL_FEE_COLLECTOR.toLowerCase())) reject('Live protocol fee collector must be explicitly included in allowedRecipients.');
  return policy;
}

export function buildWalletEnv(env) {
  if (typeof env.AGENT_PRIVATE_KEY !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(env.AGENT_PRIVATE_KEY) || /^0x0{64}$/i.test(env.AGENT_PRIVATE_KEY)) reject('AGENT_PRIVATE_KEY must be a nonzero 32-byte hex private key.');
  if (BigInt(env.AGENT_PRIVATE_KEY) >= 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n) reject('AGENT_PRIVATE_KEY is outside the secp256k1 scalar range.');
  if (typeof env.AGENT_WALLET_ADDRESS !== 'string' || !ADDRESS.test(env.AGENT_WALLET_ADDRESS) || /^0x0{40}$/i.test(env.AGENT_WALLET_ADDRESS)) reject('AGENT_WALLET_ADDRESS must be a nonzero deployed wallet address.');
  const chainId = env.CHAIN_ID ?? '84532';
  if (!['84532', '8453'].includes(chainId)) reject('CHAIN_ID must be 84532 (Base Sepolia) or 8453 (Base).');
  const rpc = env.RPC_URL ?? (chainId === '84532' ? 'https://sepolia.base.org' : 'https://mainnet.base.org');
  endpoint(rpc);
  return { AGENT_PRIVATE_KEY: env.AGENT_PRIVATE_KEY, AGENT_WALLET_ADDRESS: env.AGENT_WALLET_ADDRESS, CHAIN_ID: chainId, RPC_URL: rpc };
}

function atomicJson(file, value) {
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(value)}\n`);
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    fs.renameSync(temporary, file);
    // Persist the replacement directory entry before returning authorization.
    // An unavailable directory sync leaves the conservative hold and fails closed.
    fd = fs.openSync(path.dirname(file), 'r');
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

/** @param {{auditDir: string, approve?: (request: Readonly<ApprovalRequest>) => Promise<unknown>, mode?: BridgeMode, clock?: () => number}} options */
export function createPaymentGuard(rawPolicy, options) {
  const { auditDir, approve = async () => false, mode = 'mock', clock = Date.now } = options;
  validateMode(mode);
  const policy = mode === 'live' ? validateLivePolicy(rawPolicy) : validateBridgePolicy(rawPolicy);
  function now() {
    const at = clock();
    if (!Number.isSafeInteger(at) || at < 0 || at > 8_640_000_000_000_000) reject('Host clock returned an invalid timestamp.');
    return at;
  }
  fs.mkdirSync(auditDir, { recursive: true });
  const budgetPath = path.join(auditDir, 'bridge-budget.json');
  const lockPath = `${budgetPath}.lock`;
  const logPath = path.join(auditDir, 'bridge-audit.jsonl');
  const emit = event => fs.appendFileSync(logPath, `${JSON.stringify({ timestamp: new Date(now()).toISOString(), ...event })}\n`, { mode: 0o600 });

  function preflight(toolName, args) {
    if (!ALLOWED_TOOLS.includes(toolName)) reject(`Tool ${toolName} is not permitted by the bridge.`);
    if (!record(args)) reject('Tool arguments must be an object.');
    if (toolName === 'get_wallet_info') {
      if (Object.keys(args).length) reject('Wallet-info arguments must be empty.');
      return null;
    }
    if (Object.keys(args).some(k => !['url', 'method', 'max_payment_eth', 'timeout_ms', 'idempotencyKey'].includes(k))) reject('Unsupported payment arguments; headers, bodies and session overrides are not allowed.');
    const url = endpoint(args.url);
    if (!policy.allowedEndpoints.includes(url)) reject('Endpoint is not on the bridge allowlist.');
    if (args.method !== undefined && args.method !== 'GET') reject('The research bridge permits GET requests only.');
    const bounds = paymentBounds(args.max_payment_eth, mode);
    if (bounds.limit <= 0n || bounds.limit > amount(policy.maxUsdcPerTx, 'maxUsdcPerTx')) reject('Request exceeds the per-transaction cap or has a zero bound.');
    if (args.timeout_ms !== undefined && (!Number.isInteger(args.timeout_ms) || args.timeout_ms < 1000 || args.timeout_ms > 60000)) reject('Invalid request timeout.');
    if (args.idempotencyKey !== undefined && (typeof args.idempotencyKey !== 'string' || !/^[^\s\x00-\x1f\x7f]{1,128}$/.test(args.idempotencyKey))) reject('Invalid idempotency key.');
    return { url, ...bounds };
  }

  const evidence = request => ({ mode, maxUsdc: request.maxUsdc, maxPrincipalUsdc: request.maxPrincipalUsdc, maxProtocolFeeUsdc: request.maxProtocolFeeUsdc, protocolFeeRecipient: mode === 'live' ? X402_PROTOCOL_FEE_COLLECTOR : null });

  async function authorize(toolName, args) {
    const request = preflight(toolName, args);
    if (!request) return null;
    const reservationId = crypto.randomUUID();
    emit({ eventType: 'bridge.payment_requested', reservationId, toolName, endpoint: request.url, ...evidence(request), allowedRecipients: policy.allowedRecipients });
    if (request.limit > amount(policy.approvalThresholdUsdc, 'approvalThresholdUsdc')) {
      const approved = await approve(Object.freeze({ toolName, endpoint: request.url, ...evidence(request), allowedRecipients: policy.allowedRecipients }));
      emit({ eventType: 'bridge.approval_decided', reservationId, approved: approved === true, ...evidence(request) });
      if (approved !== true) reject('Human approval was required and was not granted.');
    }
    let lock;
    try { lock = fs.openSync(lockPath, 'wx', 0o600); } catch { reject('Budget lock is held or unavailable; reconcile before retrying.'); }
    try {
      const at = now();
      let entries = [];
      if (fs.existsSync(budgetPath)) {
        let state;
        try { state = JSON.parse(fs.readFileSync(budgetPath, 'utf8')); } catch { reject('Budget state is corrupt; reconcile before retrying.'); }
        if (!record(state) || state.version !== 1 || !Array.isArray(state.entries) || state.entries.length > 10000) reject('Budget state is invalid; reconcile before retrying.');
        entries = state.entries.map(entry => {
          if (!record(entry) || typeof entry.id !== 'string' || !Number.isSafeInteger(entry.at) || entry.at < 0 || typeof entry.micros !== 'string' || !/^[1-9]\d{0,14}$/.test(entry.micros)) reject('Budget entry is invalid; reconcile before retrying.');
          return entry;
        }).filter(entry => at - entry.at < DAY_MS);
      }
      const reserved = entries.reduce((sum, entry) => sum + BigInt(entry.micros), 0n);
      if (reserved + request.limit > amount(policy.maxUsdcPerDay, 'maxUsdcPerDay') || entries.length >= 10000) reject('Rolling 24-hour budget cap would be exceeded.');
      entries.push({ id: reservationId, at, micros: request.limit.toString() });
      atomicJson(budgetPath, { version: 1, entries });
      // Reserve the full authorized bound before forwarding. Unknown payment
      // outcomes never refund this local safety budget automatically.
      emit({ eventType: 'bridge.payment_reserved', reservationId, toolName, endpoint: request.url, ...evidence(request) });
      return reservationId;
    } finally {
      fs.closeSync(lock);
      fs.unlinkSync(lockPath);
    }
  }

  return Object.freeze({ policy, mode, preflight, authorize, emit });
}

export async function configureServerPolicy(server, rawPolicy) {
  const policy = validateBridgePolicy(rawPolicy);
  // The pinned nine-decimal policy engine drafts at >= threshold. One policy
  // unit above the inclusive host cap permits equality but no next USDC unit.
  const exclusiveUnits = amount(policy.maxUsdcPerTx, 'maxUsdcPerTx') * 1000n + 1n;
  const perTxCapEth = `${exclusiveUnits / 1_000_000_000n}.${(exclusiveUnits % 1_000_000_000n).toString().padStart(9, '0')}`;
  const result = await server.callToolResult('set_spend_policy', { scopeKey: 'starter-host', dailyLimitEth: policy.maxUsdcPerDay, perTxCapEth, allowedRecipients: [...policy.allowedRecipients] });
  let parsed;
  try {
    if (result.isError || !Array.isArray(result.content) || result.content.length !== 1 || result.content[0].type !== 'text') reject('Server policy installation failed.');
    parsed = JSON.parse(result.content[0].text);
  } catch { reject('Server policy installation returned no verified policy.'); }
  const echoed = parsed?.policy;
  if (parsed.success !== true || !record(echoed) || echoed.dailyLimitEth !== policy.maxUsdcPerDay || echoed.perTxCapEth !== perTxCapEth || !Array.isArray(echoed.allowedRecipients) || JSON.stringify(echoed.allowedRecipients.map(v => typeof v === 'string' ? v.toLowerCase() : v).sort()) !== JSON.stringify([...policy.allowedRecipients].sort())) reject('Server policy did not match the host policy.');
}

export function readPaymentNarration(result, args, policy, mode) {
  validateMode(mode);
  const validatedPolicy = mode === 'live' ? validateLivePolicy(policy) : validateBridgePolicy(policy);
  const bounds = paymentBounds(args.max_payment_eth, mode);
  if (!Array.isArray(result.content) || result.content.length !== 1 || result.content[0].type !== 'text') reject('Unexpected payment result; reconcile before retrying.');
  const text = result.content[0].text;
  const settledError = result.isError === true && text.startsWith('❌ x402_pay failed after settlement. Do not resubmit this request.');
  const success = result.isError !== true && text.startsWith(mode === 'mock' ? 'x402 Fetch Result (SIMULATED)\n' : '🌐 **x402 Fetch Result**\n');
  if (!settledError && !success) reject('Payment result has no verifiable receipt; reconcile before retrying.');
  // Neither merchant response text nor follow-up error text is receipt evidence.
  const header = text.split(/(?:\*\*)?(?:Response Body|Follow-up Error)(?:\*\*)?/u, 1)[0];
  const amountAtomic = /^\s*Amount:\s*(\d+) \(base units\)/mu.exec(header)?.[1];
  const payee = /^\s*Recipient:\s*(0x[0-9a-fA-F]{40})\s*$/mu.exec(header)?.[1]?.toLowerCase();
  const receiptId = /^\s*TX Hash:\s*(0x[0-9a-fA-F]{64})\s*$/mu.exec(header)?.[1];
  if (amountAtomic && payee && receiptId && !/^0x0{64}$/i.test(receiptId) && validatedPolicy.allowedRecipients.includes(payee) && BigInt(amountAtomic) > 0n && BigInt(amountAtomic) <= bounds.principalMicros) {
    const receipt = { amountAtomic, payee, receiptId };
    if (mode === 'mock') return receipt;
    const fee = protocolFeeAmount(BigInt(amountAtomic));
    return { ...receipt, protocolFeeAtomic: fee.toString(), totalDebitAtomic: (BigInt(amountAtomic) + fee).toString(), protocolFeeRecipient: X402_PROTOCOL_FEE_COLLECTOR };
  }
  if (success && header.includes('✅ No payment required')) return null;
  reject('Payment result has no verifiable receipt within policy; reconcile before retrying.');
}
