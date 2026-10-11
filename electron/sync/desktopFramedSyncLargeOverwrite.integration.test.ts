// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { FRAMED_SYNC_NODE_VERSION_FACT } from '../../lib/core/sync/framedSyncNodeFactContract.js';

import { fileInboundEvidence } from './desktopFramedSyncFileEvidence.testSupport.js';
import { largeOverwriteState, verifyLargeOverwriteAttachments,
  verifyLargeOverwriteBodies } from './desktopFramedSyncLargeOverwrite.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';
import { continueAfterObjectCommitFailure, installObjectCommitFailure, overwriteProgressRow,
  preservedRestoreArticle, restoreIdentityState } from './desktopFramedSyncVerifiedRestoreTwoProcess.testSupport.js';
import { verifiedReceiverEvidence } from './desktopFramedSyncVerifiedTwoProcess.testSupport.js';

it.each(['restore', 'adoption'] as const)(
  'resumes the fixed 1000-node %s after object 400 and process restart', async (mode) => {
    const fixture = await createDesktopFramedSyncTwoProcessFixture();
    let succeeded = false;
    try {
      expect(await fixture.left.invoke('seed_large_overwrite')).toEqual({ nodeCount: 1000,
        readableVersions: 3000, bodyBytes: 8192, attachmentCount: 100, attachmentBytes: 65536 });
      await fixture.right.seed({ nodeId: 'old-large-library', title: 'Old library', content: 'Old library body' });
      const source = await verifyLargeOverwriteBodies(fixture.leftSnapshot.databasePath);
      await verifyLargeOverwriteAttachments(fixture.leftSnapshot.stateRoot);
      const args = { mode, peerOrigin: fixture.leftSnapshot.origin,
        peerDeviceId: 'desktop-a', restoreId: 't326-large-restore' };
      await fixture.right.invoke('round', { input: { kind: 'read_inventory' } });
      await fixture.right.invoke('begin_identity_restore', args);
      installObjectCommitFailure(fixture.rightSnapshot.databasePath, 400);
      await expect(fixture.right.invoke('identity_restore_round', args)).rejects.toThrow('identity_restore_object_rejected');
      const failed = largeOverwriteState(fixture.rightSnapshot.databasePath);
      expect(failed.nodes).toHaveLength(400);
      expect(failed.versions).toHaveLength(1200);
      const staged = await fileInboundEvidence(fixture.rightSnapshot.databasePath);
      const appliedUnits = assertInterruptedFileUnits(staged);
      const first = failed.nodes[0];
      if (!first) throw new Error('large_overwrite_completed_unit_missing');
      expect(verifiedReceiverEvidence(fixture.rightSnapshot.databasePath, 'old-large-library').node).toBeUndefined();
      const progress = overwriteProgressRow(fixture.rightSnapshot.databasePath);
      expect(progress).toBeDefined();
      const pending = restoreIdentityState(fixture.rightSnapshot.databasePath);
      assertIdentityPending(pending, mode);
      if (mode === 'restore') expect(await preservedRestoreArticle(
        path.join(fixture.rightSnapshot.stateRoot, 'identity-restore-backups'), fixture.root, 'old-large-library'))
        .toMatchObject({ content: 'Old library body' });
      const restarted = await fixture.restartRight();
      expect(restarted.snapshot.pid).not.toBe(fixture.rightSnapshot.pid);
      expect(largeOverwriteState(restarted.snapshot.databasePath)).toEqual(failed);
      expect(await fileInboundEvidence(restarted.snapshot.databasePath)).toEqual(staged);
      expect(overwriteProgressRow(restarted.snapshot.databasePath)).toEqual(progress);
      expect(restoreIdentityState(restarted.snapshot.databasePath)).toEqual(pending);
      continueAfterObjectCommitFailure(restarted.snapshot.databasePath, first.id);
      expect(await fixture.right.invoke('identity_restore_round', args)).toMatchObject({ complete: true, pending: 0 });
      const completed = await verifyLargeOverwriteBodies(restarted.snapshot.databasePath);
      expect(completed.nodes).toEqual(source.nodes);
      expect(completed.versions).toEqual(source.versions);
      expect(completed.nodes.slice(0, 400)).toEqual(failed.nodes);
      expect(completed.versions.slice(0, 1200)).toEqual(failed.versions);

      await verifyLargeOverwriteAttachments(restarted.snapshot.stateRoot);
      expect(overwriteProgressRow(restarted.snapshot.databasePath)).toBeUndefined();
      assertIdentityFinished(restoreIdentityState(restarted.snapshot.databasePath), mode);
      const finished = await fileInboundEvidence(restarted.snapshot.databasePath);
      assertFinishedFileUnits(finished, appliedUnits);
      expect(verifiedReceiverEvidence(restarted.snapshot.databasePath, 'old-large-library').node).toBeUndefined();
      succeeded = true;
    } finally {
      await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
      if (succeeded) await fs.rm(fixture.root, { recursive: true, force: true });
      else console.info('Large overwrite fixture:', fixture.root);
    }
  }, 600_000);

function assertIdentityPending(state: ReturnType<typeof restoreIdentityState>, mode: 'restore' | 'adoption') {
  if (mode === 'restore') expect(state.restores).toEqual(expect.arrayContaining([
    expect.objectContaining({ restore_id: 't326-large-restore', applied_at: null })]));
  else expect(state.metadata).toEqual(expect.arrayContaining([
    expect.objectContaining({ key: 'sync_group_local_adoption' })]));
}

function assertIdentityFinished(state: ReturnType<typeof restoreIdentityState>, mode: 'restore' | 'adoption') {
  if (mode === 'restore') expect(state.restores).toEqual(expect.arrayContaining([
    expect.objectContaining({ restore_id: 't326-large-restore', applied_at: expect.any(String) })]));
  else {
    expect(state.metadata).not.toEqual(expect.arrayContaining([expect.objectContaining({ key: 'sync_group_local_adoption' })]));
    expect(state.metadata).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'sync_group_completed_adoption' })]));
  }
}

type InboundEvidence = Awaited<ReturnType<typeof fileInboundEvidence>>;

function assertInterruptedFileUnits(staged: InboundEvidence) {
  const nodeUnits = staged.filter(unit => unit.facts.some(fact =>
    fact.kind === FRAMED_SYNC_NODE_VERSION_FACT.factKind && fact.objectType === 'node'));
  const appliedUnits = nodeUnits.filter(unit => unit.state === 'applied');
  expect(appliedUnits).toHaveLength(400);
  for (const unit of appliedUnits) expect(unit).toMatchObject({
    receipt: { receiverDeviceId: 'desktop-b' }, pins: [], attemptEntries: [] });
  const rejectedUnits = nodeUnits.filter(unit => unit.state !== 'applied');
  expect(rejectedUnits).toHaveLength(1);
  expect(rejectedUnits[0]).toMatchObject({ state: 'ready_to_apply', receipt: undefined });
  expect(rejectedUnits[0]?.verifiedManifest).toBeDefined();
  expect(rejectedUnits[0]?.pins.length).toBeGreaterThan(0);
  expect(rejectedUnits[0]?.bodies.length).toBeGreaterThan(0);
  return appliedUnits;
}

function assertFinishedFileUnits(finished: InboundEvidence, appliedUnits: InboundEvidence) {
  expect(finished.filter(unit => unit.facts.some(fact =>
    fact.kind === FRAMED_SYNC_NODE_VERSION_FACT.factKind && fact.objectType === 'node'))).toHaveLength(1000);
  for (const unit of finished) expect(unit).toMatchObject({
    state: 'applied', receipt: { receiverDeviceId: 'desktop-b' }, pins: [], attemptEntries: [], bodies: [] });
  expect(finished).toEqual(expect.arrayContaining(appliedUnits));
}
