import { Runner, Usage, type Model, type ModelResponse, type StreamEvent } from '@openai/agents';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createBridge } from './agent.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const policy = JSON.parse(fs.readFileSync(path.join(directory, 'policy.example.json'), 'utf8'));
class SimulationModel implements Model {
  private called = false;
  async getResponse(): Promise<ModelResponse> {
    if (!this.called) {
      this.called = true;
      return { usage: new Usage(), output: [{ type: 'function_call', callId: 'smoke-paid-call', name: 'x402_pay', arguments: JSON.stringify({ url: policy.allowedEndpoints[0], max_payment_eth: '0.18' }) }] };
    }
    return { usage: new Usage(), output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Local simulated paid research completed.' }] }] };
  }
  async *getStreamedResponse(): AsyncIterable<StreamEvent> { throw new Error('Smoke test uses the nonstreaming SDK path.'); }
}
const parent = path.resolve(directory, '../controlled-paid-tool/artifacts');
fs.mkdirSync(parent, { recursive: true });
const auditDir = fs.mkdtempSync(path.join(parent, 'bridge-smoke-'));
const bridge = await createBridge({ mode: 'mock', policy, auditDir, model: new SimulationModel() });
try {
  await new Runner({ tracingDisabled: true }).run(bridge.agent, 'Fetch a simulated premium data point.', { maxTurns: 3 });
  const events = fs.readFileSync(path.join(auditDir, 'bridge-audit.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert(events.some(e => e.eventType === 'bridge.receipt_recorded' && e.mode === 'mock' && e.amountAtomic === '180000'));
  assert.equal(fs.readFileSync(path.join(auditDir, 'mock-paid-calls.jsonl'), 'utf8').trim().split('\n').length, 1);
  console.log('Guarded OpenAI SDK -> local MCP -> simulated receipt verified. No API key, RPC request, or real funds used.');
  console.log(`Audit evidence: ${auditDir}`);
} finally { await bridge.close(); }
