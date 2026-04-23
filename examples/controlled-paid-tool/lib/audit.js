const fs = require('node:fs');
const path = require('node:path');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function appendAuditEvent(auditDir, event) {
  ensureDir(auditDir);
  const auditLogPath = path.join(auditDir, 'audit-log.jsonl');
  const payload = {
    timestamp: new Date().toISOString(),
    ...event,
  };
  fs.appendFileSync(auditLogPath, `${JSON.stringify(payload)}\n`, 'utf8');
  return auditLogPath;
}

function writeRunSummary(auditDir, summary) {
  ensureDir(auditDir);
  const latestPath = path.join(auditDir, 'latest-run.json');
  const stampedPath = path.join(auditDir, `${summary.runId}.json`);
  const content = `${JSON.stringify(summary, null, 2)}\n`;
  fs.writeFileSync(latestPath, content, 'utf8');
  fs.writeFileSync(stampedPath, content, 'utf8');
  return { latestPath, stampedPath };
}

module.exports = {
  appendAuditEvent,
  writeRunSummary,
  ensureDir,
};
