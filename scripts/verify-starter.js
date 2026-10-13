#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('Node.js 20+ is required.');
const tests = fs.readdirSync(path.join(root, 'tests')).filter(name => /\.test\.(?:cjs|mjs)$/.test(name)).sort().map(name => path.join(root, 'tests', name));
if (!tests.length) throw new Error('Starter regression tests are missing.');
for (const args of [['--test', ...tests], [path.join(root, 'examples/controlled-paid-tool/validate_demo.js')]]) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('Starter policy and evidence verification passed.');
