#!/usr/bin/env node
/* global console, process */

import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(process.env.PREVIEW_DEDUPE_REPO_ROOT ?? DEFAULT_REPO_ROOT);
const VALID_TARGETS = new Set(['android', 'windows']);

function parseArgs(argv) {
  const separatorIndex = argv.indexOf('--');
  const target = argv[0];
  const command = separatorIndex === -1 ? [] : argv.slice(separatorIndex + 1);
  return { command, target };
}

function workspaceHash() {
  const result = spawnSync('git', ['diff', '--binary', 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    const detail = result.stderr?.toString().trim();
    throw new Error(detail || 'git diff failed');
  }
  return createHash('sha256').update(result.stdout).digest('hex');
}

function runtimeDir() {
  return path.resolve(REPO_ROOT, process.env.PREVIEW_DEDUPE_RUNTIME_DIR ?? '.lab/internal/runtime');
}

function hashPath(target) {
  return path.join(runtimeDir(), `${target}-preview.hash`);
}

async function readStoredHash(target) {
  try {
    return (await readFile(hashPath(target), 'utf8')).trim();
  } catch {
    return '';
  }
}

async function writeStoredHash(target, hash) {
  await mkdir(runtimeDir(), { recursive: true });
  await writeFile(hashPath(target), `${hash}\n`, 'utf8');
}

function runCommand(command) {
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: 'inherit'
    });
    child.on('close', (code, signal) => {
      if (signal) {
        resolve(1);
        return;
      }
      resolve(code ?? 1);
    });
  });
}

async function main() {
  const { command, target } = parseArgs(process.argv.slice(2));
  if (!VALID_TARGETS.has(target) || command.length === 0) {
    console.error('Usage: node scripts/preview-dedupe.mjs <windows|android> -- <preview command...>');
    return 2;
  }

  const currentHash = workspaceHash();
  const storedHash = await readStoredHash(target);
  if (storedHash === currentHash) {
    console.log(`[${target}-preview] dedupe: covered hash=${currentHash}`);
    console.log(`[${target}-preview] status: SYNCED`);
    return 0;
  }

  await writeStoredHash(target, currentHash);
  console.log(`[${target}-preview] dedupe: claimed hash=${currentHash}`);
  return runCommand(command);
}

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    console.error(`[preview-dedupe] ${error.message}`);
    process.exitCode = 1;
  });
