const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function appendAuditEvent(auditDir, event) {
  ensureDir(auditDir);
  const auditLogPath = path.join(auditDir, 'audit-log.jsonl');
  const payload = {
    ...event,
    timestamp: new Date().toISOString(),
  };
  fs.appendFileSync(auditLogPath, `${JSON.stringify(payload)}\n`, { encoding: 'utf8', mode: 0o600 });
  return auditLogPath;
}

function atomicWrite(file, content) {
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(descriptor, content);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor); descriptor = undefined;
    fs.renameSync(temporary, file);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function writeRunSummary(auditDir, summary) {
  ensureDir(auditDir);
  const latestPath = path.join(auditDir, 'latest-run.json');
  const stampedPath = path.join(auditDir, `${summary.runId}.json`);
  const content = `${JSON.stringify(summary, null, 2)}\n`;
  atomicWrite(stampedPath, content);
  atomicWrite(latestPath, content);
  return { latestPath, stampedPath };
}

module.exports = {
  appendAuditEvent,
  writeRunSummary,
  ensureDir,
};
