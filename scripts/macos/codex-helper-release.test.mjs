// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import {
  assertPinnedCodexHelperIsCurrent,
  bestEffortRollForwardCodexHelperRelease,
  checkCodexHelperRelease,
  rollForwardCodexHelperRelease,
  runWithCodexHelperRollForward,
  updateCodexHelperRelease
} from './codex-helper-release.mjs';

const temporaryDirectories = [];
const ASSET_NAME = 'codex-aarch64-apple-darwin.tar.gz';

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

it('accepts the exact latest stable release and its official asset digest', async () => {
  const lockPath = await createLock('0.144.4', 'a'.repeat(64));
  const result = await checkCodexHelperRelease({ fetchImpl: releaseFetch('0.144.4', 'a'.repeat(64)), lockPath });

  expect(result.status).toBe('current');
  await expect(assertPinnedCodexHelperIsCurrent({
    fetchImpl: releaseFetch('0.144.4', 'a'.repeat(64)), lockPath
  })).resolves.toMatchObject({ version: '0.144.4' });
});

it('updates an outdated lock only when the write mode is explicitly used', async () => {
  const lockPath = await createLock('0.144.3', 'a'.repeat(64));
  const fetchImpl = releaseFetch('0.144.4', 'b'.repeat(64));

  await expect(assertPinnedCodexHelperIsCurrent({ fetchImpl, lockPath }))
    .rejects.toThrow('Bundled Codex 0.144.3 is outdated');
  const result = await updateCodexHelperRelease({ fetchImpl, lockPath });

  expect(result.status).toBe('updated');
  expect(JSON.parse(await readFile(lockPath, 'utf8'))).toEqual({
    assetName: ASSET_NAME, sha256: 'b'.repeat(64), version: '0.144.4'
  });
});

it('rejects and repairs a same-version lock with a non-official digest', async () => {
  const lockPath = await createLock('0.144.4', 'a'.repeat(64));
  const fetchImpl = releaseFetch('0.144.4', 'b'.repeat(64));

  await expect(assertPinnedCodexHelperIsCurrent({ fetchImpl, lockPath }))
    .rejects.toThrow('Bundled Codex 0.144.4 is mismatch');
  const result = await updateCodexHelperRelease({ fetchImpl, lockPath });

  expect(result.status).toBe('updated');
  expect(JSON.parse(await readFile(lockPath, 'utf8'))).toEqual({
    assetName: ASSET_NAME, sha256: 'b'.repeat(64), version: '0.144.4'
  });
});

it.each([
  { draft: false, prerelease: true, tag_name: 'rust-v0.145.0-alpha.1' },
  { draft: true, prerelease: false, tag_name: 'rust-v0.144.4' }
])('rejects prerelease and draft GitHub releases', async (release) => {
  const lockPath = await createLock('0.144.4', 'a'.repeat(64));
  const fetchImpl = vi.fn(async () => ({
    json: async () => ({ ...release, assets: [officialAsset('a'.repeat(64))] }), ok: true
  }));

  await expect(checkCodexHelperRelease({ fetchImpl, lockPath })).rejects.toThrow('official stable');
});

it('rejects a stable asset without an official SHA-256 digest', async () => {
  const lockPath = await createLock('0.144.4', 'a'.repeat(64));
  const fetchImpl = vi.fn(async () => ({
    json: async () => ({
      assets: [{ digest: null, name: ASSET_NAME }], draft: false, prerelease: false, tag_name: 'rust-v0.144.4'
    }),
    ok: true
  }));

  await expect(checkCodexHelperRelease({ fetchImpl, lockPath })).rejects.toThrow('trusted SHA-256');
});

it('prepares a newer release before atomically advancing the lock for the next build', async () => {
  const lockPath = await createLock('0.144.5', 'a'.repeat(64));
  const snapshot = JSON.parse(await readFile(lockPath, 'utf8'));
  const prepareRelease = vi.fn(async () => undefined);

  const result = await rollForwardCodexHelperRelease(snapshot, {
    fetchImpl: releaseFetch('0.144.6', 'b'.repeat(64)), lockPath, prepareRelease
  });

  expect(result.status).toBe('updated');
  expect(prepareRelease).toHaveBeenCalledWith({
    assetName: ASSET_NAME, sha256: 'b'.repeat(64), version: '0.144.6'
  });
  expect(JSON.parse(await readFile(lockPath, 'utf8'))).toMatchObject({ version: '0.144.6' });
});

it('preserves a concurrent lock advance instead of overwriting it', async () => {
  const lockPath = await createLock('0.144.5', 'a'.repeat(64));
  const snapshot = JSON.parse(await readFile(lockPath, 'utf8'));
  const prepareRelease = vi.fn(async () => {
    await writeFile(lockPath, `${JSON.stringify({
      assetName: ASSET_NAME, sha256: 'c'.repeat(64), version: '0.144.7'
    })}\n`);
  });

  const result = await rollForwardCodexHelperRelease(snapshot, {
    fetchImpl: releaseFetch('0.144.6', 'b'.repeat(64)), lockPath, prepareRelease
  });

  expect(result.status).toBe('concurrent');
  expect(JSON.parse(await readFile(lockPath, 'utf8'))).toMatchObject({ version: '0.144.7' });
});

it('does not silently accept a same-version digest change', async () => {
  const lockPath = await createLock('0.144.6', 'a'.repeat(64));
  const snapshot = JSON.parse(await readFile(lockPath, 'utf8'));
  const prepareRelease = vi.fn();

  const result = await rollForwardCodexHelperRelease(snapshot, {
    fetchImpl: releaseFetch('0.144.6', 'b'.repeat(64)), lockPath, prepareRelease
  });

  expect(result.status).toBe('mismatch');
  expect(prepareRelease).not.toHaveBeenCalled();
  expect(JSON.parse(await readFile(lockPath, 'utf8'))).toEqual(snapshot);
});

it('keeps successful packaging successful when next-build preparation fails', async () => {
  const lockPath = await createLock('0.144.5', 'a'.repeat(64));
  const snapshot = JSON.parse(await readFile(lockPath, 'utf8'));
  const logger = { log: vi.fn(), warn: vi.fn() };

  await expect(runWithCodexHelperRollForward(snapshot, async () => 'package-ok', {
    fetchImpl: releaseFetch('0.144.6', 'b'.repeat(64)),
    lockPath,
    logger,
    prepareRelease: async () => { throw new Error('download unavailable'); }
  })).resolves.toBe('package-ok');
  expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('download unavailable'));
  expect(JSON.parse(await readFile(lockPath, 'utf8'))).toEqual(snapshot);
});

it('never attempts roll-forward after package work fails', async () => {
  const prepareRelease = vi.fn();
  const snapshot = { assetName: ASSET_NAME, sha256: 'a'.repeat(64), version: '0.144.5' };

  await expect(runWithCodexHelperRollForward(snapshot, async () => {
    throw new Error('verification failed');
  }, { fetchImpl: releaseFetch('0.144.6', 'b'.repeat(64)), prepareRelease }))
    .rejects.toThrow('verification failed');
  expect(prepareRelease).not.toHaveBeenCalled();
});

it('reports API failures without throwing from the best-effort boundary', async () => {
  const snapshot = { assetName: ASSET_NAME, sha256: 'a'.repeat(64), version: '0.144.5' };
  const logger = { log: vi.fn(), warn: vi.fn() };
  const result = await bestEffortRollForwardCodexHelperRelease(snapshot, {
    fetchImpl: vi.fn(async () => ({ ok: false, status: 503 })), logger, prepareRelease: vi.fn()
  });

  expect(result.status).toBe('failed');
  expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('HTTP 503'));
});

async function createLock(version, sha256) {
  const directory = await mkdtemp(path.join(tmpdir(), 'foliole-codex-helper-release-'));
  temporaryDirectories.push(directory);
  const lockPath = path.join(directory, 'release.json');
  await writeFile(lockPath, `${JSON.stringify({ assetName: ASSET_NAME, sha256, version })}\n`);
  return lockPath;
}

function releaseFetch(version, sha256) {
  return vi.fn(async () => ({
    json: async () => ({
      assets: [officialAsset(sha256)], draft: false, prerelease: false, tag_name: `rust-v${version}`
    }),
    ok: true
  }));
}

function officialAsset(sha256) {
  return { digest: `sha256:${sha256}`, name: ASSET_NAME };
}
