// @vitest-environment node

import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import {
  assertAdmittedMembersRestartedTogether, assertWindowsNonemptyAdmissionReceipt,
  readNonemptyAdmissionMaterial, writeNonemptyAdmissionMaterial
} from './multi-device-sync-nonempty-admission-proof.mjs';

/* global process */

const material = { attachmentId: 'hash-c', factId: 'multi-device-sync-c-1' };
const materialFacts = { attachmentIds: ['hash-c'], availableAttachmentIds: ['hash-c'],
  facts: { 'multi-device-sync-c-1': true } };
const receipt = { firstFacts: materialFacts, localFact: material,
  preJoinFacts: { ...materialFacts, localGroupId: null, localMemberState: null,
    localTimelineId: null, userNodeCount: 7 }, restartedFacts: {
    ...materialFacts, activeMemberCount: 3, localGroupId: 'group-1',
    localTimelineId: 'timeline-1'
  } };

it('persists the exact pre-join C fact and hash attachment for later three-host proof', async () => {
  const repoRoot = path.join(process.cwd(), '.tmp', `nonempty-admission-${Date.now()}`);
  const runId = 'run-1';
  const evidenceRoot = path.join(repoRoot, '.tmp/artifacts/multi-device-sync/runs', runId,
    'b-admit-c');
  await mkdir(evidenceRoot, { recursive: true });
  try {
    writeNonemptyAdmissionMaterial(evidenceRoot, receipt);
    expect(readNonemptyAdmissionMaterial(repoRoot, runId)).toMatchObject(material);
  } finally {
    await rm(repoRoot, { force: true, recursive: true });
  }
});

it('rejects a Windows receipt that loses the C attachment after restart', () => {
  expect(() => assertWindowsNonemptyAdmissionReceipt({
    ...receipt, restartedFacts: { ...materialFacts, availableAttachmentIds: [] }
  })).toThrow('did not preserve its pre-join material');
});

it('requires B and C to retain the same group, timeline, and C fact after restart', () => {
  const android = { database: { inspection: {
    activeSyncGroupMemberCount: 3, desktopFactPresent: true, missingAttachmentCount: 0,
    missingContentBlobCount: 0,
    syncGroupId: 'group-1', syncGroupTimelineId: 'timeline-1'
  } } };
  expect(assertAdmittedMembersRestartedTogether(android, receipt)).toEqual({
    groupId: 'group-1', timelineId: 'timeline-1'
  });
  expect(() => assertAdmittedMembersRestartedTogether({ database: { inspection: {
    ...android.database.inspection, syncGroupTimelineId: 'timeline-other'
  } } }, receipt)).toThrow('did not retain the same admitted group');
  expect(() => assertAdmittedMembersRestartedTogether({ database: { inspection: {
    ...android.database.inspection, missingContentBlobCount: 1
  } } }, receipt)).toThrow('did not retain the same admitted group');
});
