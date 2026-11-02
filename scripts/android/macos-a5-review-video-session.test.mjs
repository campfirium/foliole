// @vitest-environment node
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

import { createReviewVideoControls } from './macos-a5-review-video-session.mjs';
import { assertFormalMacosA5Action, assertRegisteredMacosA5Action } from './macos-a5-action-registry.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

function fixture() {
  const evidenceRoot = fs.mkdtempSync(path.resolve('.tmp/artifacts/review-video-test-'));
  roots.push(evidenceRoot);
  const calls = [];
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  const controls = createReviewVideoControls({ evidenceRoot, serial: '87a33a4b', paths: { adb: '/fixed/adb' },
    captured: (_file, args) => { calls.push(args); return 'test observation'; },
    checked: (_file, args) => {
      calls.push(args);
      if (args.includes('kill')) child.emit('close', 130);
      if (args.includes('pull')) fs.writeFileSync(args.at(-1), 'recorded bytes');
    },
    spawnProcess: (_file, args) => { calls.push(args); return child; } });
  return { child, controls, calls, evidenceRoot };
}

it('records only the fixed device, stops its own recorder, retrieves video, and removes its temporary file', async () => {
  const { child, controls, calls, evidenceRoot } = fixture();
  await controls.command('record');
  child.stdout.emit('data', 'RECORDER_PID:123\n');
  await controls.stop();
  await controls.stop();
  expect(calls.every(args => args[0] === '-s' && args[1] === '87a33a4b')).toBe(true);
  expect(calls.some(args => args.includes('kill') && args.at(-1) === '123')).toBe(true);
  const receipt = JSON.parse(fs.readFileSync(path.join(evidenceRoot, 'recording.json'), 'utf8'));
  expect(receipt.recordings[0]).toMatchObject({ exitCode: 130, endedAt: expect.any(String) });
  expect(fs.readFileSync(receipt.recordings[0].path, 'utf8')).toBe('recorded bytes');
  expect(calls.at(-1).slice(2, 4)).toEqual(['shell', 'rm']);
});

it('rejects arbitrary commands and overlapping recorders without issuing device operations', async () => {
  const { controls, calls, child } = fixture();
  await expect(controls.command('shell rm -rf /')).rejects.toThrow('Unsupported');
  expect(calls).toEqual([]);
  await controls.command('record');
  await expect(controls.command('record')).rejects.toThrow('already active');
  child.stdout.emit('data', 'RECORDER_PID:123\n');
  await controls.stop();
});

it('preserves a failed recorder as failure instead of pulling a supposed video', async () => {
  const { controls, calls, child } = fixture();
  await controls.command('record');
  child.emit('close', 1);
  await expect(controls.stop()).rejects.toThrow('Screen recorder failed: 1');
  expect(calls.some(args => args.includes('pull'))).toBe(false);
});

it('limits lifecycle and observation operations to the acceptance app', async () => {
  const { controls, calls } = fixture();
  for (const command of ['app', 'inspect', 'home', 'notifications', 'collapse']) await controls.command(command);
  expect(calls.some(args => args.includes('com.campfirium.foliole.android.acceptance/com.foliole.android.MainActivity'))).toBe(true);
  expect(calls.some(args => args.includes('com.campfirium.foliole.android'))).toBe(false);
  const action = assertRegisteredMacosA5Action('review-video-session');
  expect(action.deviceLeaseMode).toBe('mutation');
  expect(() => assertFormalMacosA5Action(action)).toThrow('unavailable');
});
