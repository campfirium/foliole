import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import {
  acceptanceBoundaryDigest, assertAcceptanceBaseline, assertJourneyComplete,
  BASELINE_STEPS, createAcceptanceManifest, JOURNEY_STEPS, recordStep
} from './t121-three-device-acceptance-contract.mjs';
import { runAcceptancePhase } from './t121-three-device-acceptance-controller.mjs';
import { JOURNEY_ACTIONS } from './t121-three-device-journey-contract.mjs';

function candidate() {
  return { branch: 'dev', clean: true, committed: true, revision: 'a'.repeat(40),
    treeDigest: 'tree-digest', verifications: [{ name: 'contracts', status: 'passed' }] };
}

function counts(value) {
  return { attachments: value, contentBlobs: value, nodes: value };
}

function protection(device, value = 2) {
  return { counts: counts(value), device, deviceIdentity: `device-${device}`, integrity: 'ok',
    restorable: true, restorePoint: `restore-${device}` };
}

function baseline() {
  return { devices: {
    A: { activeMemberCount: 2, counts: counts(2), device: 'A', groupId: 'group-new',
      localMemberState: 'active', timelineId: 'timeline-new' },
    B: { activeMemberCount: 2, counts: counts(2), device: 'B', groupId: 'group-new',
      localMemberState: 'active', timelineId: 'timeline-new' },
    C: { activeMemberCount: 0, counts: counts(0), device: 'C', groupId: null,
      localMemberState: null, timelineId: null }
  }, groupId: 'group-new', restorePoints: {
    A: protection('A'), B: protection('B'), C: protection('C', 0)
  }, timelineId: 'timeline-new' };
}

function originalProtection() {
  return { A: protection('A'), B: protection('B'), C: protection('C') };
}

function receipt(step, manifest = null) {
  return { completedAt: '2026-08-10T00:00:00.000Z', evidenceRef: `${step}.json`,
    resultStatus: 'success', step, ...(manifest ? journeyEvidence(step, manifest) : {}) };
}

function deviceFacts(manifest, activeMemberCount) {
  return { activeMemberCount, groupId: manifest.baseline.groupId, localMemberState: 'active',
    timelineId: manifest.baseline.timelineId };
}

function journeyEvidence(step, manifest) {
  const devices = Object.fromEntries(['A', 'B', 'C'].map((device) => [device,
    deviceFacts(manifest, step.includes('survivors') || step.includes('-to-')
      || step.includes('final') ? 2 : 3)]));
  let evidence = { boundaryDigest: manifest.boundaryDigest, devices };
  if (step.endsWith('-fact-converges')) evidence = { ...evidence, factId: `${step}-id`,
    origin: step[0].toUpperCase(), visibleOn: ['A', 'B', 'C'] };
  if (step === 'a-leave') evidence = { ...evidence, activeMemberCountBefore: 3,
    groupId: manifest.baseline.groupId, localMemberState: null,
    timelineId: manifest.baseline.timelineId };
  if (step === 'reject-a-old-credentials') evidence = { ...evidence, credentialsRejected: true,
    device: 'A', groupAccessGranted: false, groupId: manifest.baseline.groupId,
    timelineId: manifest.baseline.timelineId };
  if (step === 'c-to-b-converges') evidence = { ...evidence, factId: 'c-to-b-id', origin: 'C',
    visibleOn: ['B', 'C'] };
  if (step === 'b-to-c-converges') evidence = { ...evidence, factId: 'b-to-c-id', origin: 'B',
    visibleOn: ['B', 'C'] };
  if (step === 'verify-final-convergence') {
    evidence.devices.B = { ...evidence.devices.B, convergenceDigest: 'same',
      missingAttachments: 0, missingContentBlobs: 0 };
    evidence.devices.C = { ...evidence.devices.C, convergenceDigest: 'same',
      missingAttachments: 0, missingContentBlobs: 0 };
  }
  return { action: JOURNEY_ACTIONS[step], evidence };
}

it('requires A and B to share a two-member identity while C stays unbound and empty', () => {
  expect(() => assertAcceptanceBaseline(baseline())).not.toThrow();
  const invalid = baseline();
  invalid.devices.C.counts.nodes = 1;
  expect(() => assertAcceptanceBaseline(invalid)).not.toThrow();
  invalid.devices.C.counts.nodes = 2;
  expect(() => assertAcceptanceBaseline(invalid)).toThrow('not an empty workspace count');
});

it('pins candidate, restore points, baseline, and success criteria into one boundary digest', () => {
  const manifest = createAcceptanceManifest({ baseline: baseline(), candidate: candidate(),
    originalProtection: originalProtection(), phase: 'journey' });
  const digest = acceptanceBoundaryDigest(manifest);
  manifest.baseline.groupId = 'changed';
  expect(acceptanceBoundaryDigest(manifest)).not.toBe(digest);
});

it('refuses missing, failed, duplicated, or out-of-order evidence before the next mutation', () => {
  const manifest = createAcceptanceManifest({ candidate: candidate(), phase: 'baseline' });
  expect(() => recordStep(manifest, BASELINE_STEPS[1], receipt(BASELINE_STEPS[1])))
    .toThrow(`expected ${BASELINE_STEPS[0]}`);
  expect(() => recordStep(manifest, BASELINE_STEPS[0], {
    ...receipt(BASELINE_STEPS[0]), resultStatus: 'failed'
  })).toThrow('receipt is incomplete');
  recordStep(manifest, BASELINE_STEPS[0], receipt(BASELINE_STEPS[0]));
  expect(() => recordStep(manifest, BASELINE_STEPS[0], receipt(BASELINE_STEPS[0])))
    .toThrow(`expected ${BASELINE_STEPS[1]}`);
});

it('persists each successful receipt and stops at the first red action', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't121-controller-'));
  const manifestPath = path.join(root, 'manifest.json');
  const manifest = createAcceptanceManifest({ candidate: candidate(), phase: 'baseline' });
  const actions = Object.fromEntries(BASELINE_STEPS.map((step) => [step, vi.fn(async () => receipt(step))]));
  actions[BASELINE_STEPS[2]] = vi.fn(async () => { throw new Error('fixture red'); });

  await expect(runAcceptancePhase({ actions, manifest, manifestPath })).rejects.toThrow('fixture red');
  const persisted = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  expect(persisted.receipts.map(({ step }) => step)).toEqual(BASELINE_STEPS.slice(0, 2));
  expect(actions[BASELINE_STEPS[3]]).not.toHaveBeenCalled();
});

it('accepts success only after the complete continuous journey evidence chain', () => {
  const manifest = createAcceptanceManifest({ baseline: baseline(), candidate: candidate(),
    originalProtection: originalProtection(), phase: 'journey' });
  manifest.boundaryDigest = acceptanceBoundaryDigest(manifest);
  for (const step of JOURNEY_STEPS) recordStep(manifest, step, receipt(step, manifest));
  expect(assertJourneyComplete(manifest)).toBe(true);
});

it('rejects a green-looking journey receipt that lacks bound product evidence', () => {
  const manifest = createAcceptanceManifest({ baseline: baseline(), candidate: candidate(),
    originalProtection: originalProtection(), phase: 'journey' });
  manifest.boundaryDigest = acceptanceBoundaryDigest(manifest);
  expect(() => recordStep(manifest, JOURNEY_STEPS[0], receipt(JOURNEY_STEPS[0])))
    .toThrow('registered action differs');
});
