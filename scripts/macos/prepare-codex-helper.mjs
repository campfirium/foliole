/* global Buffer, fetch */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { loadPinnedCodexHelperRelease } from './codex-helper-release.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');

async function hasExpectedHash(file, expected) {
  try {
    const content = await readFile(file);
    return createHash('sha256').update(content).digest('hex') === expected;
  } catch {
    return false;
  }
}

export async function prepareCodexHelper() {
  const release = await loadPinnedCodexHelperRelease();
  const directory = path.join(ROOT, '.tmp/macos/codex', release.version);
  const archive = path.join(directory, release.assetName);
  const command = path.join(directory, 'codex');
  await mkdir(directory, { recursive: true });
  if (!await hasExpectedHash(archive, release.sha256)) {
    await rm(archive, { force: true });
    const response = await fetch(createDownloadUrl(release));
    if (!response.ok) throw new Error(`Codex download failed: HTTP ${response.status}`);
    await writeFile(archive, Buffer.from(await response.arrayBuffer()));
  }
  if (!await hasExpectedHash(archive, release.sha256)) throw new Error('Codex SHA-256 mismatch');
  await rm(command, { force: true });
  execFileSync('tar', ['-xzf', archive, '-C', directory]);
  await rename(path.join(directory, 'codex-aarch64-apple-darwin'), command);
  await chmod(command, 0o755);
  return path.relative(ROOT, command);
}

function createDownloadUrl(release) {
  return `https://github.com/openai/codex/releases/download/rust-v${release.version}/${release.assetName}`;
}
