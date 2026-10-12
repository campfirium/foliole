// @vitest-environment node
import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { tryAcquireAttachmentReceiveOwner } from './attachmentReceiveOwner.js';

let root: string;
const children: ChildProcess[] = [];

beforeEach(async () => {
  const artifacts = path.resolve('.tmp/artifacts');
  await fs.mkdir(artifacts, { recursive: true });
  root = await fs.mkdtemp(path.join(artifacts, 'attachment-owner-'));
});

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    const exited = once(child, 'exit');
    child.kill('SIGKILL');
    await exited;
  }
  await fs.rm(root, { recursive: true, force: true });
});

async function start(directory = root) {
  const child = fork(path.resolve('electron/sync/attachmentReceiveOwner.fixture.ts'), [directory], {
    execPath: process.execPath,
    execArgv: ['--experimental-strip-types', '--experimental-loader', './scripts/android/ts-js-extension-loader.mjs'],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'ignore', 'inherit', 'ipc']
  });
  children.push(child);
  const [kind] = await once(child, 'message', { signal: AbortSignal.timeout(10_000) });
  expect(['acquired', 'busy']).toContain(kind);
  return { child, kind };
}

async function close(child: ChildProcess) {
  const exited = once(child, 'exit');
  child.send('close');
  await exited;
}

it('excludes a second process and retains ownership after rejected contenders close', async () => {
  const first = await start();
  expect(first.kind).toBe('acquired');
  expect((await start()).kind).toBe('busy');
  expect((await start()).kind).toBe('busy');
  expect(tryAcquireAttachmentReceiveOwner(root).kind).toBe('busy');
  expect((await start()).kind).toBe('busy');
  await close(first.child);
  expect((await start()).kind).toBe('acquired');
});

it('allows independent libraries and keeps the empty lock carrier after graceful release', async () => {
  const other = path.join(root, 'other');
  await fs.mkdir(other);
  const first = await start();
  const second = await start(other);
  expect([first.kind, second.kind]).toEqual(['acquired', 'acquired']);
  const file = path.join(root, '.attachment-receiver.lock');
  const held = await fs.stat(file);
  await close(first.child);
  const released = await fs.stat(file);
  expect(released.ino).toBe(held.ino);
  expect(released.size).toBe(0);
  expect(await fs.readdir(root)).toEqual(expect.arrayContaining(['.attachment-receiver.lock', 'other']));
  expect((await start()).kind).toBe('acquired');
});

it('reacquires after forced owner termination without deleting the lock file', async () => {
  const first = await start();
  expect(first.kind).toBe('acquired');
  const file = path.join(root, '.attachment-receiver.lock');
  const before = await fs.stat(file);
  const exited = once(first.child, 'exit');
  first.child.kill('SIGKILL');
  await exited;
  const deadline = Date.now() + 5_000;
  for (;;) {
    const next = await start();
    if (next.kind === 'acquired') break;
    expect(Date.now()).toBeLessThan(deadline);
    await delay(25);
  }
  const after = await fs.stat(file);
  expect(after.ino).toBe(before.ino);
  expect(after.size).toBe(0);
});

it('reports filesystem failure rather than pretending another receiver is busy', () => {
  expect(() => tryAcquireAttachmentReceiveOwner(path.join(root, 'missing'))).toThrow();
});

it('keeps the kernel lock when a rejected same-process connection closes', async () => {
  const owner = tryAcquireAttachmentReceiveOwner(root);
  expect(owner.kind).toBe('acquired');
  if (owner.kind !== 'acquired') throw new Error('expected attachment owner');
  try {
    expect(tryAcquireAttachmentReceiveOwner(root).kind).toBe('busy');
    expect((await start()).kind).toBe('busy');
  } finally { owner.close(); }
  expect((await start()).kind).toBe('acquired');
});
