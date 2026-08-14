// @vitest-environment node

import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import {
  assertWindowsNonemptyAdmissionReceipt, readNonemptyAdmissionMaterial,
  writeNonemptyAdmissionMaterial
} from './multi-device-sync-nonempty-admission-proof.mjs';

/* global process */

const material = { attachmentId: 'hash-c', factId: 'multi-device-sync-c-1' };
const materialFacts = { attachmentIds: ['hash-c'], cachedAttachmentIds: ['hash-c'],
  facts: { 'multi-device-sync-c-1': true } };
const receipt = { firstFacts: materialFacts, localFact: material,
  preJoinFacts: { ...materialFacts, localGroupId: null, localMemberState: null,
    localTimelineId: null, userNodeCount: 1 }, restartedFacts: materialFacts };

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
    ...receipt, restartedFacts: { ...materialFacts, cachedAttachmentIds: [] }
  })).toThrow('did not preserve its pre-join material');
});
