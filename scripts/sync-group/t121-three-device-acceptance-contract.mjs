import { createHash } from 'node:crypto';

import {
  assertJourneyStepEvidence, journeySuccessCriteria
} from './t121-three-device-journey-contract.mjs';

/* global structuredClone */

export const BASELINE_STEPS = [
  'freeze-candidate',
  'protect-original',
  'reset-c',
  'rebuild-a-b',
  'restart-verify-baseline',
  'protect-baseline',
  'freeze-journey'
];

export const JOURNEY_STEPS = [
  'b-admit-c',
  'verify-b-c-restart',
  'a-rejoin',
  'verify-three-members',
  'a-fact-converges',
  'b-fact-converges',
  'c-fact-converges',
  'a-leave',
  'reject-a-old-credentials',
  'verify-survivors-restart',
  'c-to-b-converges',
  'b-to-c-converges',
  'verify-final-convergence'
];

const DEVICES = ['A', 'B', 'C'];
const HEX_REVISION = /^[0-9a-f]{40}$/u;

function fail(message) {
  throw new Error(`T121 acceptance contract: ${message}`);
}

function requireText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${label} is missing`);
  return value;
}

function requireInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) fail(`${label} is invalid`);
  return value;
}

function assertCounts(counts, label, empty = false) {
  for (const key of ['nodes', 'contentBlobs', 'attachments']) {
    const value = requireInteger(counts?.[key], `${label}.${key}`);
    const expectedEmpty = key === 'nodes' ? value <= 1 : value === 0;
    if (empty && !expectedEmpty) fail(`${label}.${key} is not an empty workspace count`);
  }
}

export function assertFrozenCandidate(candidate) {
  if (!HEX_REVISION.test(candidate?.revision ?? '')) fail('candidate revision is not exact');
  requireText(candidate.treeDigest, 'candidate tree digest');
  if (candidate.branch !== 'dev' || candidate.clean !== true || candidate.committed !== true) {
    fail('candidate must be a clean committed dev revision');
  }
  if (!Array.isArray(candidate.verifications) || candidate.verifications.length === 0
      || candidate.verifications.some((item) => item?.status !== 'passed')) {
    fail('candidate verification set is incomplete');
  }
}

function assertProtectionPoint(point, device) {
  if (point?.device !== device || point.integrity !== 'ok' || point.restorable !== true) {
    fail(`${device} protection is incomplete`);
  }
  requireText(point.restorePoint, `${device} restore point`);
  requireText(point.deviceIdentity, `${device} device identity`);
  assertCounts(point.counts, `${device} protection counts`);
}

export function assertOriginalProtection(protection) {
  for (const device of DEVICES) assertProtectionPoint(protection?.[device], device);
  const restorePoints = DEVICES.map((device) => protection[device].restorePoint);
  if (new Set(restorePoints).size !== restorePoints.length) fail('restore points must be distinct');
}

function assertActiveMember(facts, device, expected) {
  if (facts?.device !== device || facts.localMemberState !== 'active') {
    fail(`${device} is not an active baseline member`);
  }
  if (facts.groupId !== expected.groupId || facts.timelineId !== expected.timelineId) {
    fail(`${device} baseline identity differs from the manifest`);
  }
  if (facts.activeMemberCount !== 2) fail(`${device} baseline member count is not two`);
  assertCounts(facts.counts, `${device} baseline counts`);
}

export function assertAcceptanceBaseline(baseline) {
  const groupId = requireText(baseline?.groupId, 'baseline group id');
  const timelineId = requireText(baseline?.timelineId, 'baseline timeline id');
  const expected = { groupId, timelineId };
  assertActiveMember(baseline.devices?.A, 'A', expected);
  assertActiveMember(baseline.devices?.B, 'B', expected);
  const c = baseline.devices?.C;
  if (c?.device !== 'C' || c.groupId !== null || c.timelineId !== null
      || c.localMemberState !== null || c.activeMemberCount !== 0) {
    fail('C is not an unbound empty baseline');
  }
  assertCounts(c.counts, 'C baseline counts', true);
  for (const device of DEVICES) assertProtectionPoint(baseline.restorePoints?.[device], device);
}

function assertReceipt(step, receipt) {
  if (receipt?.step !== step || receipt.resultStatus !== 'success') {
    fail(`${step} receipt is incomplete`);
  }
  requireText(receipt.evidenceRef, `${step} evidence ref`);
  requireText(receipt.completedAt, `${step} completion time`);
}

export function nextRequiredStep(manifest) {
  const steps = manifest.phase === 'baseline' ? BASELINE_STEPS : JOURNEY_STEPS;
  return steps[manifest.receipts.length] ?? null;
}

export function recordStep(manifest, step, receipt) {
  const expected = nextRequiredStep(manifest);
  if (expected !== step) fail(`expected ${expected ?? 'no further step'}, received ${step}`);
  assertReceipt(step, receipt);
  if (manifest.phase === 'journey') assertJourneyStepEvidence(manifest, step, receipt);
  manifest.receipts.push(structuredClone(receipt));
  return manifest;
}

export function createAcceptanceManifest({ baseline = null, candidate, originalProtection = null,
  phase }) {
  if (!['baseline', 'journey'].includes(phase)) fail('phase is invalid');
  assertFrozenCandidate(candidate);
  if (phase === 'journey') {
    assertOriginalProtection(originalProtection);
    assertAcceptanceBaseline(baseline);
  }
  return {
    baseline: baseline ? structuredClone(baseline) : null,
    candidate: structuredClone(candidate),
    createdAt: new Date().toISOString(),
    originalProtection: originalProtection ? structuredClone(originalProtection) : null,
    phase,
    receipts: [],
    schemaVersion: 1,
    successCriteria: journeySuccessCriteria()
  };
}

export function acceptanceBoundaryDigest(manifest) {
  const boundary = {
    baseline: manifest.baseline,
    candidate: manifest.candidate,
    originalProtection: manifest.originalProtection,
    schemaVersion: manifest.schemaVersion,
    successCriteria: manifest.successCriteria
  };
  return createHash('sha256').update(JSON.stringify(boundary)).digest('hex');
}

export function assertJourneyComplete(manifest) {
  if (manifest.phase !== 'journey' || nextRequiredStep(manifest) !== null) {
    fail('journey evidence is incomplete');
  }
  if (JSON.stringify(manifest.successCriteria) !== JSON.stringify(journeySuccessCriteria())
      || JSON.stringify(manifest.receipts.map(({ step }) => step)) !== JSON.stringify(JOURNEY_STEPS)) {
    fail('journey evidence order changed');
  }
  return true;
}
