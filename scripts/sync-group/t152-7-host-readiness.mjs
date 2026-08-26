#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  createFriPhysicalReadinessAdapter, runFriControlPlaneProbe
} from '../ios/fri-physical-readiness.mjs';
import { currentAcceptanceCandidate } from './multi-device-sync-candidate.mjs';
import { createHostReadinessAdapters } from './multi-device-sync-host-readiness.mjs';
import { collectEnvironmentReadiness } from './multi-device-sync-readiness.mjs';
import { createIsolatedMacosRoot } from './multi-device-sync-workspace.mjs';

const HOSTS = ['macos-a', 'android-b', 'windows-c', 'ios-d'];

function runId() {
  return `${new Date().toISOString().replace(/\D/gu, '').slice(0, 17)}-t152-7-readiness`;
}

function assertFrozenCandidate(candidate, originRevision) {
  if (!candidate.clean) throw new Error('T152-7 readiness requires a clean worktree.');
  if (candidate.revision !== originRevision) {
    throw new Error('T152-7 readiness requires HEAD to equal origin/dev.');
  }
}

export async function runT1527HostReadiness({ repoRoot = process.cwd(), id = runId(),
  inspectCandidate = currentAcceptanceCandidate,
  inspectOrigin = (root) => ({ revision: execFileSync('git', ['rev-parse', 'origin/dev'], {
    cwd: root, encoding: 'utf8'
  }).trim() }),
  createRoot = createIsolatedMacosRoot, createAdapters = createHostReadinessAdapters,
  createFriAdapter = createFriPhysicalReadinessAdapter,
  collectReadiness = collectEnvironmentReadiness, runFriProbe = runFriControlPlaneProbe } = {}) {
  const candidate = inspectCandidate(repoRoot, 'formal', 'refs/heads/dev');
  const origin = inspectOrigin(repoRoot);
  assertFrozenCandidate(candidate, origin.revision);
  createRoot({ repoRoot, runId: id });
  const adapters = createAdapters({ repoRoot, runId: id });
  adapters['ios-d'] = createFriAdapter();
  const readiness = await collectReadiness({ adapters, hosts: HOSTS });
  const root = path.join(repoRoot, '.tmp', 'artifacts', 't152-7-readiness', id);
  fs.mkdirSync(root, { recursive: true });
  let probe = null;
  if (readiness.allReady) {
    probe = await runFriProbe({ artifactRoot: path.join(root, 'fri-control-plane') });
  }
  const receipt = { candidate, completedAt: new Date().toISOString(), probe,
    readiness, resultStatus: readiness.allReady && probe ? 'ready' : 'blocked', schemaVersion: 1 };
  const receiptPath = path.join(root, 'receipt.json');
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(`[t152-7-readiness] status=${receipt.resultStatus} receipt=${receiptPath}`);
  return { receipt, receiptPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(
  'scripts/sync-group/t152-7-host-readiness.mjs')) {
  runT1527HostReadiness().then(({ receipt }) => {
    if (receipt.resultStatus !== 'ready') process.exitCode = 1;
  }).catch((error) => {
    console.error(`[t152-7-readiness] status=failed message=${error.message}`);
    process.exitCode = 1;
  });
}
