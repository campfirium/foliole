import { mkdtemp, readFile, readdir, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { SupportLogFiles } from './supportLogFiles.js';

const now = Date.now();
const old = new Date(now - 8 * 24 * 60 * 60 * 1000);
let directory: string;

async function recordingNames() {
  return (await readdir(directory)).filter(name => name.endsWith('.txt'));
}

beforeEach(async () => { directory = await mkdtemp(path.join(tmpdir(), 'foliole-support-log-')); });
afterEach(async () => { await rm(directory, { recursive: true }); });

it('writes each event immediately, retains each recording and reveals the latest after a restart', async () => {
  let time = now;
  const root = () => directory;
  const files = new SupportLogFiles(root, undefined, () => time);
  const context = async () => 'Prior error and application version';
  await files.start(context);
  const [first] = await recordingNames();
  expect(first).toBeDefined();
  const firstPath = path.join(directory, first!);
  for (let index = 0; index < 260; index++) {
    await files.append(() => JSON.stringify({ name: 'runtime.event', index }));
  }
  const content = await readFile(firstPath, 'utf8');
  expect(content).toContain('Prior error and application version');
  expect(content).toContain('"index":259');
  await files.stop();

  time += 1000;
  await files.start(context);
  await files.stop();
  expect(await readdir(directory)).toHaveLength(2);
  expect(await readFile(firstPath, 'utf8')).toContain('"index":259');
  const reveal = vi.fn();
  const restarted = new SupportLogFiles(root);
  await expect(restarted.reveal(reveal)).resolves.toEqual({ phase: 'ready' });
  expect(reveal).toHaveBeenCalledOnce();
  expect(reveal.mock.calls[0]?.[0]).not.toBe(firstPath);
});

it('resumes the same short recording once and makes it ready after the next restart', async () => {
  let time = now;
  const launch = () => new SupportLogFiles(() => directory, undefined, () => time);
  const initial = launch();
  const started = await initial.start(async () => 'context');
  await initial.append(() => '{"event":"before"}');

  time += 60_000;
  const resumed = launch();
  await expect(resumed.status()).resolves.toEqual(started);
  await resumed.append(() => '{"event":"after"}', now);

  time += 60_000;
  const reopened = launch();
  await expect(reopened.status()).resolves.toEqual({ phase: 'ready' });
  await reopened.append(() => '{"event":"too-late"}', now);
  const [name] = await recordingNames();
  const text = await readFile(path.join(directory, name!), 'utf8');
  expect(text).toContain('"event":"before"');
  expect(text).toContain('"event":"after"');
  expect(text).toContain('"reason":"restart-limit"');
  expect(text).not.toContain('too-late');
});

it('uses the original five-minute deadline after a restart', async () => {
  let time = now;
  const launch = () => new SupportLogFiles(() => directory, undefined, () => time);
  await launch().start(async () => 'context');
  time += 299_000;
  const resumed = launch();
  await expect(resumed.status()).resolves.toEqual({ phase: 'recording', startedAt: now });
  time += 1_000;
  await resumed.append(() => '{"event":"too-late"}');
  await expect(resumed.status()).resolves.toEqual({ phase: 'ready' });
  const [name] = await recordingNames();
  const text = await readFile(path.join(directory, name!), 'utf8');
  expect(text).toContain('"reason":"expired"');
  expect(text).not.toContain('too-late');
});

it('prunes only managed files by age and capacity and keeps the active file', async () => {
  const files = new SupportLogFiles(() => directory, 1024);
  const makeOldName = (id: string) => path.join(directory, `foliole-log-${now}-12345678-1234-1234-1234-1234567890${id}.txt`);
  const expired = makeOldName('01');
  const oversized = makeOldName('02');
  const foreign = path.join(directory, 'keep.txt');
  const link = makeOldName('03');
  await writeFile(expired, 'past due');
  await utimes(expired, old, old);
  await writeFile(oversized, 'x'.repeat(900));
  await writeFile(foreign, 'unmanaged');
  if (process.platform !== 'win32') await symlink(foreign, link);

  await files.start(async () => 'context');
  await expect(readFile(expired)).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(readFile(oversized)).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(readFile(foreign, 'utf8')).resolves.toBe('unmanaged');
  if (process.platform !== 'win32') await expect(readFile(link, 'utf8')).resolves.toBe('unmanaged');
  expect((await files.status()).phase).toBe('recording');
  await files.append(() => 'x'.repeat(1024));
  expect((await files.status()).phase).toBe('ready');
  const reveal = vi.fn();
  await files.reveal(reveal);
  const content = await readFile(reveal.mock.calls[0]![0], 'utf8');
  expect(content).toContain('"reason":"capacity"');
  expect(Buffer.byteLength(content)).toBeLessThanOrEqual(1024);
});
