#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { executeBounded } from './windows-bounded-process.mjs';
import { windowsDevPaths } from './windows-dev-paths.mjs';

const OWNER = { owner: 'windows-c-fixed', purpose: 'multi-device-sync-acceptance', schemaVersion: 1 };

function failure(message, missingFact, lastSuccessfulAction) {
  return Object.assign(new Error(message), { lastSuccessfulAction, missingFact });
}

export function windowsAcceptanceRoot(paths) {
  return path.win32.join(paths.repoRoot, '.tmp', 'artifacts', 'multi-device-sync', 'windows-c');
}

export function provisionWindowsAcceptanceRoot({ fsApi = fs, paths = windowsDevPaths() } = {}) {
  const root = windowsAcceptanceRoot(paths);
  fsApi.mkdirSync(root, { recursive: true });
  const marker = path.win32.join(root, 'acceptance-owner.json');
  if (fsApi.existsSync(marker)) {
    const current = JSON.parse(fsApi.readFileSync(marker, 'utf8'));
    if (JSON.stringify(current) !== JSON.stringify(OWNER)) {
      throw failure('Windows acceptance root has another owner.', 'windows_owner_mismatch', 'root_resolved');
    }
  } else {
    fsApi.writeFileSync(marker, `${JSON.stringify(OWNER, null, 2)}\n`, 'utf8');
  }
  return { marker, root };
}

async function git(execute, paths, args) {
  const result = await execute(paths.gitPath, ['-C', paths.repoRoot, ...args], {
    cwd: paths.repoRoot, timeoutCode: 'windows_readiness_git_timeout', timeoutMs: 10_000,
    windowsHide: true
  });
  if (result.code !== 0) throw failure(`git ${args[0]} failed`, 'windows_repo_unavailable', 'ssh_connected');
  return result.stdout.trim();
}

export async function inspectWindowsAcceptanceReadiness({ execute = executeBounded,
  fsApi = fs, paths = windowsDevPaths(), platform = process.platform } = {}) {
  if (platform !== 'win32') throw failure('Windows host is required.', 'windows_host_mismatch', 'entry');
  if (!fsApi.existsSync(paths.systemNode) || !fsApi.existsSync(paths.gitPath)) {
    throw failure('Fixed Windows runtime is missing.', 'windows_runtime_missing', 'host_confirmed');
  }
  const root = windowsAcceptanceRoot(paths);
  const marker = path.win32.join(root, 'acceptance-owner.json');
  if (!fsApi.existsSync(marker)) {
    throw failure('Windows acceptance owner is missing.', 'windows_owner_missing', 'repo_read');
  }
  const owner = JSON.parse(fsApi.readFileSync(marker, 'utf8'));
  if (JSON.stringify(owner) !== JSON.stringify(OWNER)) {
    throw failure('Windows owner marker differs.', 'windows_owner_mismatch', 'root_resolved');
  }
  if (await git(execute, paths, ['branch', '--show-current']) !== 'dev') {
    throw failure('Windows repository is not on dev.', 'windows_dev_branch_missing', 'repo_read');
  }
  if (await git(execute, paths, ['status', '--porcelain']) !== '') {
    throw failure('Windows repository is dirty.', 'windows_repo_dirty', 'repo_read');
  }
  const stats = fsApi.statfsSync(root);
  if (stats.bavail * stats.bsize < 4 * 1024 ** 3) {
    throw failure('Windows acceptance disk is low.', 'windows_disk_budget_missing', 'owner_checked');
  }
  return { facts: ['windows_ssh_ready', 'windows_repo_ready', 'windows_isolated_owner_ready'], root };
}

async function main(argv) {
  if (argv.length === 1 && argv[0] === '--provision') {
    provisionWindowsAcceptanceRoot();
    console.log('[multi-device-sync-readiness] status=provisioned');
    return;
  }
  if (argv.length !== 0) throw new Error('usage: windows-multi-device-sync-readiness [--provision]');
  await inspectWindowsAcceptanceReadiness();
  console.log('[multi-device-sync-readiness] status=ready');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`[multi-device-sync-readiness] status=blocked missingFact=${error.missingFact || 'exception'}`);
    process.exitCode = 1;
  });
}
