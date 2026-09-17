/* global Buffer, fetch, process */

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

export async function prepareCodexHelper(options = {}) {
  const release = options.release ?? await loadPinnedCodexHelperRelease(options.lockPath);
  const root = options.root ?? ROOT;
  const directory = path.join(root, '.tmp/macos/codex', release.version);
  const archive = path.join(directory, release.assetName);
  const command = path.join(directory, 'codex');
  await mkdir(directory, { recursive: true });
  if (!await hasExpectedHash(archive, release.sha256)) {
    const temporaryArchive = `${archive}.${process.pid}.tmp`;
    await rm(temporaryArchive, { force: true });
    try {
      const response = await (options.fetchImpl ?? fetch)(createDownloadUrl(release));
      if (!response.ok) throw new Error(`Codex download failed: HTTP ${response.status}`);
      const content = Buffer.from(await response.arrayBuffer());
      if (createHash('sha256').update(content).digest('hex') !== release.sha256) {
        throw new Error('Codex SHA-256 mismatch');
      }
      await writeFile(temporaryArchive, content);
      await rename(temporaryArchive, archive);
    } finally {
      await rm(temporaryArchive, { force: true });
    }
  }
  if (!await hasExpectedHash(archive, release.sha256)) throw new Error('Codex SHA-256 mismatch');
  await rm(command, { force: true });
  execFileSync('tar', ['-xzf', archive, '-C', directory]);
  await rename(path.join(directory, 'codex-aarch64-apple-darwin'), command);
  await chmod(command, 0o755);
  assertCodexHelperVersion(command, release.version, options.run);
  return path.relative(root, command);
}

export function assertCodexHelperVersion(command, expectedVersion, run = execFileSync) {
  const output = run(command, ['--version'], { encoding: 'utf8' }).trim();
  const actualVersion = output.match(/\b\d+\.\d+\.\d+\b/u)?.[0];
  if (actualVersion !== expectedVersion) {
    throw new Error(`Codex version mismatch: expected ${expectedVersion}, received ${actualVersion ?? output}`);
  }
}

function createDownloadUrl(release) {
  return `https://github.com/openai/codex/releases/download/rust-v${release.version}/${release.assetName}`;
}
