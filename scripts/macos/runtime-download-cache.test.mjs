// @vitest-environment node
/* global Buffer */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { prepareCodexHelper } from './prepare-codex-helper.mjs';
import { prepareNodeSeaRuntime } from './node-sea-runtime.mjs';
import { runtimeArchivePath, runtimeDownloadCacheEnv } from './runtime-download-cache.mjs';

const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'foliole-runtime-cache-'));
  roots.push(root);
  const input = path.join(root, 'input');
  await mkdir(input);
  await writeFile(path.join(input, 'codex-aarch64-apple-darwin'), '#!/bin/sh\necho codex-cli 1.2.3\n');
  const archive = path.join(root, 'codex.tar.gz');
  execFileSync('tar', ['-czf', archive, '-C', input, 'codex-aarch64-apple-darwin']);
  const bytes = await readFile(archive);
  const release = { version: '1.2.3', assetName: 'codex.tar.gz',
    sha256: createHash('sha256').update(bytes).digest('hex') };
  const fetchImpl = vi.fn(async () => ({ ok: true, arrayBuffer: async () => bytes }));
  return { root, release, bytes, fetchImpl, env: runtimeDownloadCacheEnv(root) };
}

it('shares verified archives across deleted sources while keeping extracted helpers isolated', async () => {
  const context = await fixture();
  const first = path.join(context.root, 'source-a');
  const second = path.join(context.root, 'source-b');
  const command = await prepareCodexHelper({ ...context, root: first });
  expect(path.resolve(first, command).startsWith(first)).toBe(true);
  await rm(first, { recursive: true });
  const next = await prepareCodexHelper({ ...context, root: second });
  expect(execFileSync(path.resolve(second, next), ['--version'], { encoding: 'utf8' })).toContain('1.2.3');
  expect(context.fetchImpl).toHaveBeenCalledTimes(1);
});

it('repairs corrupt archives and rejects corrupt replacement bytes', async () => {
  const context = await fixture();
  await prepareCodexHelper(context);
  const archive = await runtimeArchivePath(context.release.assetName, context.release.sha256, context.env);
  await writeFile(archive, 'corrupt');
  await prepareCodexHelper(context);
  expect(context.fetchImpl).toHaveBeenCalledTimes(2);
  await writeFile(archive, 'corrupt again');
  const fetchImpl = async () => ({ ok: true, arrayBuffer: async () => Buffer.from('bad') });
  await expect(prepareCodexHelper({ ...context, fetchImpl })).rejects.toThrow('SHA-256 mismatch');
});

it('separates changed content even when a release reuses its asset name', async () => {
  const { env } = await fixture();
  expect(await runtimeArchivePath('runtime.tar.gz', 'a'.repeat(64), env))
    .not.toBe(await runtimeArchivePath('runtime.tar.gz', 'b'.repeat(64), env));
  await expect(runtimeArchivePath('runtime.tar.gz', 'a', { FOLIOLE_RUNTIME_DOWNLOAD_CACHE: 'relative' }))
    .rejects.toThrow('absolute');
});

it('rejects invalid Node SEA bytes before publishing or extracting a shared archive', async () => {
  const { root, env } = await fixture();
  const run = vi.fn();
  await expect(prepareNodeSeaRuntime(root, { env, run,
    fetchImpl: async () => ({ ok: true, arrayBuffer: async () => Buffer.from('bad') })
  })).rejects.toThrow('checksum mismatch');
  expect(run).not.toHaveBeenCalled();
});
