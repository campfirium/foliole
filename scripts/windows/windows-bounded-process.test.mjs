// @vitest-environment node

import { EventEmitter } from 'node:events';
import process from 'node:process';
import { expect, it, vi } from 'vitest';

import { executeBounded, terminateProcessTree } from './windows-bounded-process.mjs';

function hangingChild() {
  const child = new EventEmitter();
  child.pid = 42;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

it('terminates a timed out command tree and reports the stage error code', async () => {
  const child = hangingChild();
  const terminateTree = vi.fn();
  await expect(executeBounded('installer.exe', [], {
    spawnImpl: () => child,
    terminateTree,
    timeoutCode: 'installer_timeout',
    timeoutMs: 5
  })).rejects.toMatchObject({ code: 'installer_timeout' });
  expect(terminateTree).toHaveBeenCalledWith(42, { platform: process.platform });
});

it('uses taskkill with the child-tree flags on Windows', () => {
  const runCommand = vi.fn(() => ({ status: 0, stderr: '', stdout: '' }));
  terminateProcessTree(77, { platform: 'win32', runCommand });
  expect(runCommand).toHaveBeenCalledWith(
    'taskkill.exe',
    ['/PID', '77', '/T', '/F'],
    expect.objectContaining({ shell: false, timeout: 15_000 })
  );
});
