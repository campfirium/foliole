/* global Buffer */

import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { assertCodexHelperVersion, prepareCodexHelper } from './prepare-codex-helper.mjs';

const temporaryDirectories = [];
const ASSET_NAME = 'codex-aarch64-apple-darwin.tar.gz';

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { force: true, recursive: true })
  )));
});

it('uses the explicit release snapshot and rejects downloaded bytes with the wrong digest', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'foliole-codex-helper-'));
  temporaryDirectories.push(root);
  const content = Buffer.from('not the expected archive');
  const fetchImpl = vi.fn(async () => ({
    arrayBuffer: async () => content,
    ok: true
  }));
  const release = {
    assetName: ASSET_NAME,
    sha256: createHash('sha256').update('different content').digest('hex'),
    version: '0.144.6'
  };
  await writeFile(path.join(root, 'unused-lock.json'), JSON.stringify({ version: '0.1.0' }));

  await expect(prepareCodexHelper({ fetchImpl, release, root })).rejects.toThrow('SHA-256 mismatch');
  expect(fetchImpl).toHaveBeenCalledWith(
    'https://github.com/openai/codex/releases/download/rust-v0.144.6/codex-aarch64-apple-darwin.tar.gz'
  );
  await expect(readFile(path.join(root, '.tmp/macos/codex/0.144.6', ASSET_NAME)))
    .rejects.toMatchObject({ code: 'ENOENT' });
});

it('reuses a cached helper only when its pinned binary digest and version match', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'foliole-codex-helper-'));
  temporaryDirectories.push(root);
  const command = path.join(root, '.tmp/macos/codex/0.144.6/codex');
  await mkdir(path.dirname(command), { recursive: true });
  await writeFile(command, 'verified helper');
  const fetchImpl = vi.fn();
  const run = vi.fn(() => 'codex-cli 0.144.6\n');
  const release = {
    assetName: ASSET_NAME,
    binarySha256: createHash('sha256').update('verified helper').digest('hex'),
    sha256: 'a'.repeat(64),
    version: '0.144.6'
  };

  await expect(prepareCodexHelper({ fetchImpl, release, root, run }))
    .resolves.toBe('.tmp/macos/codex/0.144.6/codex');
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(run).toHaveBeenCalledWith(command, ['--version'], { encoding: 'utf8' });
});

it('requires the extracted helper version to match the immutable release snapshot', () => {
  expect(() => assertCodexHelperVersion('/tmp/codex', '0.144.5', () => 'codex-cli 0.144.6\n'))
    .toThrow('expected 0.144.5');
  expect(() => assertCodexHelperVersion('/tmp/codex', '0.144.5', () => 'codex-cli 0.144.5\n'))
    .not.toThrow();
});
