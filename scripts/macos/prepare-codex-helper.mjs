/* global Buffer, fetch */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CODEX_VERSION = '0.144.3';
const CODEX_ASSET = 'codex-aarch64-apple-darwin.tar.gz';
const CODEX_SHA256 = '249aaf12644add3876e740998cba0eac8d7d175e903add8cbc8d8eaa1f02e2b5';
const CODEX_URL = `https://github.com/openai/codex/releases/download/rust-v${CODEX_VERSION}/${CODEX_ASSET}`;

async function hasExpectedHash(file, expected) {
  try {
    const content = await readFile(file);
    return createHash('sha256').update(content).digest('hex') === expected;
  } catch {
    return false;
  }
}

export async function prepareCodexHelper() {
  const directory = path.join(ROOT, '.tmp/macos/codex', CODEX_VERSION);
  const archive = path.join(directory, CODEX_ASSET);
  const command = path.join(directory, 'codex');
  await mkdir(directory, { recursive: true });
  if (!await hasExpectedHash(archive, CODEX_SHA256)) {
    await rm(archive, { force: true });
    const response = await fetch(CODEX_URL);
    if (!response.ok) throw new Error(`Codex download failed: HTTP ${response.status}`);
    await writeFile(archive, Buffer.from(await response.arrayBuffer()));
  }
  if (!await hasExpectedHash(archive, CODEX_SHA256)) throw new Error('Codex SHA-256 mismatch');
  await rm(command, { force: true });
  execFileSync('tar', ['-xzf', archive, '-C', directory]);
  await rename(path.join(directory, 'codex-aarch64-apple-darwin'), command);
  await chmod(command, 0o755);
  return path.relative(ROOT, command);
}
