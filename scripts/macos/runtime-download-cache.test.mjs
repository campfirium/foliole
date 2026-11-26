// @vitest-environment node
/* global Buffer */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { codexCodeModeHostPath, prepareCodexHelper } from './prepare-codex-helper.mjs';
import { prepareNodeSeaRuntime } from './node-sea-runtime.mjs';
import { runtimeArchivePath, runtimeDownloadCacheEnv } from './runtime-download-cache.mjs';

const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function archiveFixture(root, entry, assetName, script) {
  const input = path.join(root, 'input');
  await mkdir(input, { recursive: true });
  await writeFile(path.join(input, entry), script);
  const archive = path.join(root, assetName);
  execFileSync('tar', ['-czf', archive, '-C', input, entry]);
  const bytes = await readFile(archive);
  return { assetName, bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}
async function fixture(hostEntry = 'codex-code-mode-host-aarch64-apple-darwin') {
  const root = await mkdtemp(path.join(tmpdir(), 'foliole-runtime-cache-'));
  roots.push(root);
  const codex = await archiveFixture(root, 'codex-aarch64-apple-darwin', 'codex.tar.gz',
    '#!/bin/sh\necho codex-cli 1.2.3\n');
  const host = await archiveFixture(root, hostEntry, 'host.tar.gz', '#!/bin/sh\necho host\n');
  const release = { version: '1.2.3', assetName: codex.assetName, sha256: codex.sha256,
    codeModeHost: { assetName: host.assetName, sha256: host.sha256 } };
  const fetchImpl = vi.fn(async (url) => ({
    ok: true, arrayBuffer: async () => (url.endsWith('/host.tar.gz') ? host.bytes : codex.bytes)
  }));
  return { root, release, fetchImpl, env: runtimeDownloadCacheEnv(root) };
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
  expect(execFileSync(codexCodeModeHostPath(path.resolve(second, next)), { encoding: 'utf8' })).toContain('host');
  expect(context.fetchImpl).toHaveBeenCalledTimes(2);
});

it('repairs corrupt archives and rejects corrupt replacement bytes', async () => {
  const context = await fixture();
  await prepareCodexHelper(context);
  const { assetName, sha256 } = context.release.codeModeHost;
  const archive = await runtimeArchivePath(assetName, sha256, context.env);
  await writeFile(archive, 'corrupt');
  await prepareCodexHelper(context);
  expect(context.fetchImpl).toHaveBeenCalledTimes(3);
  await writeFile(archive, 'corrupt again');
  const fetchImpl = async () => ({ ok: true, arrayBuffer: async () => Buffer.from('bad') });
  await expect(prepareCodexHelper({ ...context, fetchImpl })).rejects.toThrow('Codex code-mode host SHA-256 mismatch');
});

it('rejects a code-mode host archive with an unexpected layout', async () => {
  const context = await fixture('codex-code-mode-host');
  await expect(prepareCodexHelper(context)).rejects.toThrow('archive layout mismatch');
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
