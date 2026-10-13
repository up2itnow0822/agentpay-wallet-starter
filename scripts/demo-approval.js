#!/usr/bin/env node
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const result = spawnSync(process.execPath, [path.join(__dirname, '../examples/controlled-paid-tool/run_demo.js'), 'approval', ...process.argv.slice(2)], { env: { ...process.env, NEMOCLAW_AUTO_APPROVE: 'yes' }, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
