// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ workers: [] as import('node:worker_threads').Worker[] }));
vi.mock('node:worker_threads', async (original) => {
  const native = await original<typeof import('node:worker_threads')>();
  return { ...native, Worker: class extends native.Worker {
    constructor(url: URL, options: import('node:worker_threads').WorkerOptions) {
      super(new URL(url.href.replace(/\.js$/, '.ts')), { ...options,
        execArgv: ['--experimental-loader', './scripts/android/ts-js-extension-loader.mjs', '--experimental-strip-types'] });
      state.workers.push(this);
    }
  } };
});

import { cloudflarePagesUploadBatches, prepareCloudflarePagesFiles } from './cloudflarePagesAssets.js';
import { deployCloudflarePages } from './cloudflarePagesClient.js';
import { prepareCloudflarePagesFilesOffMainThread } from './cloudflarePagesPreparationWorkerClient.js';

const roots: string[] = [];
afterEach(() => {
  expect(state.workers.splice(0).every((worker) => worker.threadId === -1)).toBe(true);
  vi.unstubAllGlobals();
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});

function site() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-pages-contract-'));
  roots.push(root);
  return root;
}

function response(result: unknown) {
  return new Response(JSON.stringify({ result, success: true }), { status: 200 });
}

it('handles main events while preparing a deployment before the first network request', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-pages-progress-'));
  roots.push(root);
  for (let index = 0; index < 10; index += 1) {
    fs.writeFileSync(path.join(root, `${index}.bin`), Buffer.alloc(1024 * 1024, index));
  }
  let turns = 0;
  let active = true;
  const tick = () => { if (active) { turns += 1; setImmediate(tick); } };
  setImmediate(tick);
  let turnsBeforeNetwork = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/upload-token')) {
      turnsBeforeNetwork = turns;
      return response({ jwt: 'synthetic-jwt' });
    }
    if (url.endsWith('/check-missing')) return response([]);
    return response({ id: 'synthetic', latest_stage: { status: 'success' } });
  }));
  try {
    await deployCloudflarePages({ accountId: 'synthetic', projectName: 'synthetic', siteRoot: root, token: 'synthetic' });
  } finally { active = false; }
  expect(turnsBeforeNetwork).toBeGreaterThan(2);
});

it('preserves bytes, paths, types, hashes and upload batching across a real worker', async () => {
  const root = site();
  fs.mkdirSync(path.join(root, 'nested'));
  fs.writeFileSync(path.join(root, 'index.html'), '<h1>Hello</h1>');
  fs.writeFileSync(path.join(root, 'empty'), '');
  fs.writeFileSync(path.join(root, 'nested', 'Case.CSS'), 'body { color: red; }');
  fs.writeFileSync(path.join(root, 'nested', 'binary.bin'), Buffer.from([0, 255, 128, 1]));
  const expected = prepareCloudflarePagesFiles(root);
  const actual = await prepareCloudflarePagesFilesOffMainThread(root);
  expect(actual).toEqual(expected);
  expect(actual.find((file) => file.relativePath === 'index.html')?.hash).toBe('8deb79e268ae1932009657bb3e496c87');
  expect(actual.every((file) => Buffer.isBuffer(file.body) && file.body.buffer.byteLength === file.body.byteLength)).toBe(true);
  expect(cloudflarePagesUploadBatches(actual)).toEqual(cloudflarePagesUploadBatches(expected));
});

it('rejects invalid or oversized sites before contacting the network', async () => {
  const root = site();
  const file = path.join(root, 'too-big.bin');
  const fd = fs.openSync(file, 'w');
  fs.ftruncateSync(fd, 25 * 1024 * 1024 + 1);
  fs.closeSync(fd);
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  await expect(prepareCloudflarePagesFilesOffMainThread(root)).rejects.toThrow('up to 25 MiB');
  await expect(deployCloudflarePages({ accountId: 'synthetic', projectName: 'synthetic', siteRoot: root, token: 'synthetic' }))
    .rejects.toThrow("Couldn't reach Cloudflare.");
  await expect(prepareCloudflarePagesFilesOffMainThread(path.join(root, 'missing'))).rejects.toThrow('ENOENT');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('stops an in-flight worker before rejecting cancellation and permits a retry', async () => {
  const root = site();
  fs.writeFileSync(path.join(root, 'large.bin'), Buffer.alloc(10 * 1024 * 1024));
  const controller = new AbortController();
  const pending = prepareCloudflarePagesFilesOffMainThread(root, controller.signal);
  state.workers.at(-1)!.once('online', () => controller.abort());
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(state.workers.at(-1)?.threadId).toBe(-1);
  fs.writeFileSync(path.join(root, 'large.bin'), 'retry');
  await expect(prepareCloudflarePagesFilesOffMainThread(root)).resolves.toEqual(prepareCloudflarePagesFiles(root));
  const count = state.workers.length;
  await expect(prepareCloudflarePagesFilesOffMainThread(root, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(state.workers).toHaveLength(count);
});

it('rejects an unexpected worker exit without returning partial files', async () => {
  const root = site();
  fs.writeFileSync(path.join(root, 'large.bin'), Buffer.alloc(10 * 1024 * 1024));
  const pending = prepareCloudflarePagesFilesOffMainThread(root);
  const worker = state.workers.at(-1)!;
  worker.once('online', () => { void worker.terminate(); });
  await expect(pending).rejects.toThrow('preparation worker exited');
  expect(worker.threadId).toBe(-1);
});
