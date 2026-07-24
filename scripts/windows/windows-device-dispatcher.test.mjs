// @vitest-environment node

import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

import { dispatchWindowsDevice } from './windows-device-dispatcher.mjs';
import { devicePaths, readJson, writeJsonAtomic } from './windows-device-state.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-device-dispatch-'));
  return { paths: devicePaths(root), root };
}

it('writes one deploy request and triggers only the registered task', () => {
  const { paths } = fixture();
  const calls = [];
  const result = dispatchWindowsDevice({
    argv: ['deploy', '28875057319', '97b1c11e0e3579e41f2fe028a84aea83596b53cf'], env: {}, paths,
    runCommand: (command, args) => calls.push([command, args])
  });
  expect(result.state).toBe('pending');
  expect(readJson(paths.active)).toMatchObject({ runId: '28875057319' });
  expect(calls).toEqual([['schtasks.exe', ['/Run', '/TN', 'FoliolePhysicalAcceptance']]]);
});

it('rejects another identity while a task owns the slot', () => {
  const { paths } = fixture();
  writeJsonAtomic(paths.status, { identity: `${'a'.repeat(40)}:1`, state: 'running' });
  expect(() => dispatchWindowsDevice({ argv: ['deploy', '2', 'b'.repeat(40)], env: {}, paths, runCommand: () => {} })).toThrow('another');
});

it('lists and streams only files under the recorded evidence root', () => {
  const { paths, root } = fixture();
  const evidenceRoot = path.join(root, 'evidence');
  fs.mkdirSync(path.join(evidenceRoot, 'screenshots'), { recursive: true });
  fs.writeFileSync(path.join(evidenceRoot, 'result.json'), '{}');
  fs.writeFileSync(path.join(evidenceRoot, 'screenshots', 'a.png'), 'png');
  writeJsonAtomic(paths.status, { evidenceRoot, state: 'completed' });
  expect(dispatchWindowsDevice({ argv: ['collect', 'list'], env: {}, paths }).files).toEqual(['result.json', 'screenshots/a.png']);
  const chunks = [];
  dispatchWindowsDevice({ argv: ['collect', 'get', 'result.json'], env: {}, paths, stdout: { write: (chunk) => chunks.push(chunk) } });
  expect(Buffer.concat(chunks).toString()).toBe('{}');
});

it('keeps a task active when process-tree cancellation fails', () => {
  const { paths } = fixture();
  writeJsonAtomic(paths.status, { identity: `${'a'.repeat(40)}:1`, pid: 42, state: 'running' });
  expect(() => dispatchWindowsDevice({
    argv: ['cancel'], env: {}, paths, runCommand: () => { throw new Error('taskkill denied'); }
  })).toThrow('taskkill denied');
  expect(readJson(paths.status)).toMatchObject({ errorCode: 'cancel_incomplete', state: 'running' });
});
