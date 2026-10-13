#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const required = [
  'README.md', 'LICENSE', 'CONTRIBUTING.md', 'docs/quickstart-paid-tool.md',
  'docs/relationship-guide.md', 'docs/choose-your-path.md', 'docs/policy-example.md',
  'docs/export-readiness.md', 'configs/policy.example.json',
  'configs/claude_desktop_config.example.json', 'configs/cursor_mcp.example.json',
  'configs/openclaw_mcp.example.json', 'scripts/verify-starter.js',
  'examples/controlled-paid-tool/README.md', 'examples/coding-agent-bridge/gateway.mjs',
  'examples/coding-agent-bridge/package-lock.json',
];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file)) || !fs.statSync(path.join(root, file)).isFile()) throw new Error(`Missing required export file: ${file}`);
}
console.log('Core export files present.');
require('./verify-starter');
console.log('Export check passed.');
