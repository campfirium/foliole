#!/usr/bin/env node
/* global process */

import { spawn } from 'node:child_process';

const child = spawn(
  process.execPath,
  ['scripts/preview-dedupe.mjs', 'windows', '--', process.execPath, 'scripts/windows/windows-preview-native.mjs'],
  {
    env: {
      ...process.env,
      PREVIEW_DEDUPE_REQUIRE_ACTUAL: '1'
    },
    stdio: 'inherit'
  }
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
