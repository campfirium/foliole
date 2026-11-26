/* global Buffer, fetch, process */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { loadPinnedCodexHelperRelease } from './codex-helper-release.mjs';
import { runtimeArchivePath } from './runtime-download-cache.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');

async function hasExpectedHash(file, expected) {
  try {
    const content = await readFile(file);
    return createHash('sha256').update(content).digest('hex') === expected;
  } catch {
    return false;
  }
}

// Codex spawns the code-mode host from its own directory for tool calls, so both ship side by side.
export function codexCodeModeHostPath(codexPath) {
  return path.join(path.dirname(codexPath), 'codex-code-mode-host');
}

export async function prepareCodexHelper(options = {}) {
  const release = options.release ?? await loadPinnedCodexHelperRelease(options.lockPath);
  const root = options.root ?? ROOT;
  const directory = path.join(root, '.tmp/macos/codex', release.version);
  const command = path.join(directory, 'codex');
  await mkdir(directory, { recursive: true });
  await prepareExecutable(options, release.version, release, {
    command, entry: 'codex-aarch64-apple-darwin', label: 'Codex'
  });
  await prepareExecutable(options, release.version, release.codeModeHost, {
    command: codexCodeModeHostPath(command),
    entry: 'codex-code-mode-host-aarch64-apple-darwin',
    label: 'Codex code-mode host'
  });
  assertCodexHelperVersion(command, release.version, options.run);
  return path.relative(root, command);
}

async function prepareExecutable(options, version, asset, { command, entry, label }) {
  const directory = path.dirname(command);
  const archive = await runtimeArchivePath(path.join(directory, asset.assetName), asset.sha256, options.env);
  await rm(command, { force: true });
  if (!await hasExpectedHash(archive, asset.sha256)) {
    const temporaryArchive = `${archive}.${process.pid}.tmp`;
    await rm(temporaryArchive, { force: true });
    try {
      const response = await (options.fetchImpl ?? fetch)(createDownloadUrl(version, asset.assetName));
      if (!response.ok) throw new Error(`${label} download failed: HTTP ${response.status}`);
      const content = Buffer.from(await response.arrayBuffer());
      if (createHash('sha256').update(content).digest('hex') !== asset.sha256) {
        throw new Error(`${label} SHA-256 mismatch`);
      }
      await writeFile(temporaryArchive, content);
      await rename(temporaryArchive, archive);
    } finally {
      await rm(temporaryArchive, { force: true });
    }
  }
  if (!await hasExpectedHash(archive, asset.sha256)) throw new Error(`${label} SHA-256 mismatch`);
  const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim();
  if (entries !== entry) {
    throw new Error(`${label} archive layout mismatch: expected only ${entry}, received ${entries}`);
  }
  await rm(path.join(directory, entry), { force: true });
  execFileSync('tar', ['-xzf', archive, '-C', directory]);
  await rename(path.join(directory, entry), command);
  await chmod(command, 0o755);
}

export function assertCodexHelperVersion(command, expectedVersion, run = execFileSync) {
  const output = run(command, ['--version'], { encoding: 'utf8' }).trim();
  const actualVersion = output.match(/\b\d+\.\d+\.\d+\b/u)?.[0];
  if (actualVersion !== expectedVersion) {
    throw new Error(`Codex version mismatch: expected ${expectedVersion}, received ${actualVersion ?? output}`);
  }
}

function createDownloadUrl(version, assetName) {
  return `https://github.com/openai/codex/releases/download/rust-v${version}/${assetName}`;
}
