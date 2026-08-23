import { createHash } from 'node:crypto';

import { branchForCandidateSourceRef } from './multi-device-sync-source-ref.mjs';

/* global structuredClone */

export const FAILURE_OWNERS = ['environment', 'controller', 'product', 'candidate'];
export const RECEIPT_STATUSES = ['passed', 'blocked', 'failed', 'stalled', 'invalidated'];
export const RUN_MODES = ['diagnostic', 'formal'];
export const HOSTS = ['macos-a', 'android-b', 'windows-c'];

function fail(message) {
  throw new Error(`Multi-device sync acceptance: ${message}`);
}

export function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function assertCandidate(candidate, mode = 'diagnostic') {
  if (!RUN_MODES.includes(mode)) fail('mode is invalid');
  if (!/^[0-9a-f]{40}$/u.test(candidate?.revision ?? '')
      || !/^[0-9a-f]{40}$/u.test(candidate?.treeDigest ?? '')) {
    fail('candidate source identity is incomplete');
  }
  let sourceBranch;
  try { sourceBranch = branchForCandidateSourceRef(candidate.sourceRef); }
  catch { fail('candidate source ref is invalid'); }
  if (candidate.branch !== sourceBranch || candidate.committed !== true
      || (mode === 'formal' && candidate.clean !== true)) fail('candidate is not frozen');
  return candidate;
}

export function assertReceipt(receipt) {
  if (!receipt || !RECEIPT_STATUSES.includes(receipt.status)) fail('receipt status is invalid');
  if (!FAILURE_OWNERS.includes(receipt.failureOwner)) fail('receipt failure owner is invalid');
  if (!HOSTS.includes(receipt.host) && receipt.host !== 'all') fail('receipt host is invalid');
  for (const field of ['stage', 'startedAt', 'completedAt']) {
    if (typeof receipt[field] !== 'string' || receipt[field] === '') fail(`${field} is missing`);
  }
  if (!Number.isFinite(receipt.durationMs) || receipt.durationMs < 0) fail('duration is invalid');
  if (!Array.isArray(receipt.inputFacts) || !Array.isArray(receipt.outputFacts)) {
    fail('receipt facts are invalid');
  }
  if (receipt.status !== 'passed' && (!receipt.missingFact || !receipt.lastSuccessfulAction)) {
    fail('failed receipt attribution is incomplete');
  }
  return receipt;
}

export function createRun({ candidate, mode, runId, scenario }) {
  assertCandidate(candidate, mode);
  if (!/^[A-Za-z0-9.-]{1,96}$/u.test(runId ?? '')) fail('run owner is invalid');
  if (typeof scenario !== 'string' || scenario === '') fail('scenario is missing');
  return {
    candidate: structuredClone(candidate), createdAt: new Date().toISOString(), mode,
    receipts: [], runId, scenario, schemaVersion: 1, status: 'running'
  };
}

export function recordReceipt(run, receipt) {
  assertReceipt(receipt);
  const readinessStage = receipt.stage.endsWith('readiness');
  const aggregatingReadiness = readinessStage
    && run.receipts.slice(run.receipts.findLastIndex((entry) => !entry.stage.endsWith('readiness')) + 1)
      .every((entry) => entry.stage === receipt.stage);
  if (run.status !== 'running' && !aggregatingReadiness) fail('run is already terminal');
  run.receipts.push(structuredClone(receipt));
  if (run.status === 'running' && receipt.status !== 'passed') run.status = receipt.status;
  return run;
}

export function finalizeRun(run, currentCandidate) {
  assertCandidate(currentCandidate, run.mode);
  const boundary = ['revision', 'treeDigest', 'sourceRef'];
  const changed = boundary.find((key) => run.candidate[key] !== currentCandidate[key]);
  if (changed) {
    run.status = 'invalidated';
    run.invalidatedBy = changed;
  } else if (run.status === 'running') {
    run.status = 'passed';
  }
  run.completedAt = new Date().toISOString();
  run.summaryDigest = digest({ candidate: run.candidate, receipts: run.receipts,
    runId: run.runId, scenario: run.scenario, status: run.status });
  return run;
}
