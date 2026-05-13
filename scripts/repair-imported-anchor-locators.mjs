#!/usr/bin/env node
/* global process */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'repair-imported-anchor-locators.ts');
const result = spawnSync(process.execPath, ['--experimental-strip-types', scriptPath, ...process.argv.slice(2)], {
  stdio: 'inherit'
});

process.exit(result.status ?? 1);
