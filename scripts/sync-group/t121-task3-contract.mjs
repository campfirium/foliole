import { createHash } from 'node:crypto';

/* global structuredClone */

export const TASK3_STEPS = [
  'a-rejoin',
  'verify-three-members',
  'a-fact-converges',
  'b-fact-converges',
  'c-fact-converges',
  'verify-three-restart'
];

function fail(detail) {
  throw new Error(`T121 task 3 contract: ${detail}`);
}

function requireCounts(counts, label) {
  for (const key of ['nodes', 'contentBlobs', 'attachments']) {
    if (!Number.isSafeInteger(counts?.[key]) || counts[key] < 0) fail(`${label}.${key} is invalid`);
  }
  if (counts.missingContentBlobs !== 0 || counts.missingAttachments !== 0) {
    fail(`${label} resources are incomplete`);
  }
}

function requireIdentity(value, expected, label, activeMemberCount = 3) {
  if (value?.groupId !== expected.groupId || value?.timelineId !== expected.timelineId
      || value.localMemberState !== 'active' || value.activeMemberCount !== activeMemberCount) {
    fail(`${label} identity is incomplete`);
  }
  requireCounts(value.counts, label);
}

export function assertTask2OutputBaseline(baseline) {
  const expected = { groupId: baseline?.groupId, timelineId: baseline?.timelineId };
  if (!expected.groupId || !expected.timelineId) fail('baseline identity is missing');
  requireIdentity(baseline.devices?.B, expected, 'B');
  requireIdentity(baseline.devices?.C, expected, 'C');
  const a = baseline.devices?.A;
  if (a?.groupId !== expected.groupId || a?.timelineId !== expected.timelineId
      || a.localMemberState !== 'active' || ![2, 3].includes(a.activeMemberCount)) {
    fail('offline A identity is incomplete');
  }
  requireCounts(a.counts, 'A');
  for (const device of ['A', 'B', 'C']) {
    const point = baseline.restorePoints?.[device];
    if (point?.device !== device || point.integrity !== 'ok' || point.restorable !== true
        || !point.restorePoint || !point.deviceIdentity) fail(`${device} restore point is incomplete`);
  }
}

export function task3BoundaryDigest(manifest) {
  return createHash('sha256').update(JSON.stringify({ baseline: manifest.baseline,
    candidate: manifest.candidate, schemaVersion: manifest.schemaVersion,
    steps: TASK3_STEPS })).digest('hex');
}

function requireDevices(evidence, manifest, step) {
  for (const device of ['A', 'B', 'C']) {
    requireIdentity(evidence?.devices?.[device], manifest.baseline, `${step}.${device}`);
  }
}

export function assertTask3Receipt(manifest, step, receipt) {
  if (TASK3_STEPS[manifest.receipts.length] !== step || receipt?.step !== step
      || receipt.resultStatus !== 'success' || !receipt.evidenceRef
      || receipt.evidence?.boundaryDigest !== manifest.boundaryDigest) {
    fail(`${step} receipt is incomplete or out of order`);
  }
  requireDevices(receipt.evidence, manifest, step);
  if (step.endsWith('-fact-converges')) {
    const origin = step[0].toUpperCase();
    if (receipt.evidence.origin !== origin || !receipt.evidence.factId
        || JSON.stringify(receipt.evidence.visibleOn) !== JSON.stringify(['A', 'B', 'C'])) {
      fail(`${step} fact visibility is incomplete`);
    }
  }
  manifest.receipts.push(structuredClone(receipt));
}

export function createTask3Manifest({ baseline, candidate }) {
  assertTask2OutputBaseline(baseline);
  if (candidate?.branch !== 'dev' || candidate.clean !== true || candidate.committed !== true
      || !/^[0-9a-f]{40}$/u.test(candidate.revision ?? '')
      || !Array.isArray(candidate.verifications) || candidate.verifications.length === 0
      || candidate.verifications.some(({ status }) => status !== 'passed')) fail('candidate is not frozen');
  const manifest = { baseline: structuredClone(baseline), candidate: structuredClone(candidate),
    createdAt: new Date().toISOString(), receipts: [], schemaVersion: 1 };
  manifest.boundaryDigest = task3BoundaryDigest(manifest);
  return manifest;
}

export function assertTask3Complete(manifest) {
  if (JSON.stringify(manifest.receipts.map(({ step }) => step)) !== JSON.stringify(TASK3_STEPS)) {
    fail('continuous evidence is incomplete');
  }
  return true;
}
