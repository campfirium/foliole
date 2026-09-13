// @vitest-environment node
import { once } from 'node:events';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { spawnLoggedChild, stopLoggedChild } from './macos-electron-dev-process.mjs';

const logger = { stdout() {}, stderr() {} };
function launch(source) {
  return spawnLoggedChild(process.execPath, ['-e', source], {
    cwd: process.cwd(), detached: true, env: process.env, logger
  });
}

describe('managed DEV child shutdown', () => {
  it('waits for inherited output to close after the shell exits', async () => {
    const active = launch(`
      const { spawn } = require('node:child_process');
      spawn(process.execPath, ['-e', 'setTimeout(() => {}, 150)'], { stdio: 'inherit' });
      process.exit(0);
    `);
    let closed = false;
    void active.closed.then(() => { closed = true; });
    await once(active.child, 'exit');
    expect(closed).toBe(false);
    expect((await active.closed).code).toBe(0);
  });

  it('reaps an unresponsive owned process group before completing cleanup', async () => {
    const active = launch(`
      const { spawn } = require('node:child_process');
      process.on('SIGTERM', () => {});
      const child = spawn(process.execPath, ['-e',
        'process.on("SIGTERM", () => {}); console.log("ready"); setInterval(() => {}, 1000)'
      ], { stdio: ['ignore', 'inherit', 'inherit'] });
      console.log(child.pid);
      setInterval(() => {}, 1000);
    `);
    let output = '';
    const ready = new Promise((resolve) => active.child.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.includes('ready')) resolve();
    }));
    try {
      await ready;
      await stopLoggedChild(active, 100);
      expect((await active.closed).signal).toBe('SIGKILL');
      expect(() => process.kill(-active.child.pid, 0)).toThrow();
    } finally {
      await stopLoggedChild(active, 100);
    }
  });

  it('completes cleanup when spawning fails without signalling an unknown group', async () => {
    const active = spawnLoggedChild('/missing-foliole-dev-executable', [], {
      cwd: process.cwd(), detached: true, env: process.env, logger
    });
    await stopLoggedChild(active, 100);
    expect((await active.closed).error.code).toBe('ENOENT');
  });
});
