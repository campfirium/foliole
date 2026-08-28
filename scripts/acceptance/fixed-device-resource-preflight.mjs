#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  acquireMacosA5DeviceLease, releaseMacosA5DeviceLease
} from '../android/macos-a5-run-lease.mjs';
import { createMacosA5ExecutionContext } from '../android/macos-a5-execution-context.mjs';
import { createFriPhysicalReadinessAdapter, FRI_UDID } from '../ios/fri-physical-readiness.mjs';
import { currentAcceptanceCandidate } from '../sync-group/multi-device-sync-candidate.mjs';
import {
  atomicWriteJson, createFrozenAttemptId, sha256
} from './frozen-revision-preflight-contract.mjs';

function exclusiveGateHeld(env) {
  return new Set((env.FOLIOLE_RESOURCE_GATE_HELD ?? '').split(',')).has('exclusive');
}

export function fixedDevicePreflightPaths(repoRoot, revision, attemptId) {
  const root = path.join(repoRoot, '.tmp', 'artifacts', 'frozen-revision-preflight',
    revision, 'fixed-devices', attemptId);
  return { receiptPath: path.join(root, 'receipt.json'), root };
}

function assertSource(repoRoot, expectedRevision) {
  const candidate = currentAcceptanceCandidate(repoRoot, 'diagnostic');
  if (!candidate.clean || candidate.branch !== 'dev'
      || (expectedRevision && candidate.revision !== expectedRevision)) {
    throw new Error('Fixed-device preflight requires the clean frozen dev revision.');
  }
  return candidate;
}

export async function runFixedDeviceResourcePreflight({
  env = process.env, fsApi = fs, friReadiness = createFriPhysicalReadinessAdapter(),
  id, now = () => new Date(), repoRoot = process.cwd(), revision
} = {}) {
  const candidate = assertSource(repoRoot, revision);
  if (!exclusiveGateHeld(env)) {
    throw new Error('Fixed-device preflight requires the exclusive resource gate.');
  }
  const attemptId = createFrozenAttemptId({ id, now });
  const paths = fixedDevicePreflightPaths(repoRoot, candidate.revision, attemptId);
  fsApi.mkdirSync(path.dirname(paths.root), { recursive: true });
  fsApi.mkdirSync(paths.root);
  const receipt = {
    attemptId, completedAt: null, exit: { code: null, stage: 'opened' },
    failure: null, fixedA5: { identity: '87a33a4b', lease: null },
    fixedFri: { facts: [], identity: FRI_UDID,
      resourceLock: { className: 'exclusive', ownerPid: process.pid } },
    resultStatus: 'pending', schemaVersion: 1,
    source: { revision: candidate.revision, tree: candidate.treeDigest },
    startedAt: now().toISOString()
  };
  atomicWriteJson(paths.receiptPath, receipt, fsApi);
  const context = createMacosA5ExecutionContext({ action: 'frozen-revision-preflight',
    acceptedRevision: candidate.revision, acceptedTree: candidate.treeDigest,
    formalSourceClass: 'source-free-readonly', repoRoot, runId: id?.() });
  let lease;
  try {
    receipt.exit.stage = 'a5-resource-lock';
    lease = acquireMacosA5DeviceLease(context, 'readonly-lifecycle', { fsApi });
    receipt.fixedA5.lease = { acquiredAt: lease.owner.acquiredAt,
      mode: lease.owner.mode, ownerDigest: sha256(JSON.stringify(lease.owner)),
      releasedAt: null, runId: lease.owner.runId };
    releaseMacosA5DeviceLease(lease, fsApi);
    receipt.fixedA5.lease.releasedAt = now().toISOString();
    lease = null;
    receipt.exit.stage = 'fri-resource-lock';
    const fri = await friReadiness();
    receipt.fixedFri.facts = fri.facts;
    assertSource(repoRoot, candidate.revision);
    Object.assign(receipt, { completedAt: now().toISOString(),
      exit: { code: 0, stage: 'complete' }, resultStatus: 'complete' });
    atomicWriteJson(paths.receiptPath, receipt, fsApi);
    return { receipt, receiptPath: paths.receiptPath };
  } catch (error) {
    if (lease) releaseMacosA5DeviceLease(lease, fsApi);
    Object.assign(receipt, { completedAt: now().toISOString(),
      exit: { code: 1, stage: receipt.exit.stage },
      failure: { messageDigest: sha256(error.message), missingFact: error.missingFact ?? null },
      resultStatus: error.missingFact ? 'blocked' : 'failed' });
    atomicWriteJson(paths.receiptPath, receipt, fsApi);
    throw Object.assign(error, { receiptPath: paths.receiptPath });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const revisionIndex = process.argv.indexOf('--revision');
  const revision = revisionIndex >= 0 ? process.argv[revisionIndex + 1] : null;
  try {
    const result = await runFixedDeviceResourcePreflight({ revision });
    console.log(`[fixed-device-resource-preflight] status=complete receipt=${result.receiptPath}`);
  } catch (error) {
    console.error(`[fixed-device-resource-preflight] status=failed receipt=${error.receiptPath ?? '-'} message=${error.message}`);
    process.exitCode = 1;
  }
}
