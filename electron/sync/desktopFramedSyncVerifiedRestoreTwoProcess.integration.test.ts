// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { readFixtureInventory } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';
import { assertReceiverRestoreSourcesCleared, seedReceiverRestoreSources } from './desktopFramedSyncVerifiedRestoreSources.testSupport.js';
import { assertOverwriteGlobalSettings, assertOverwriteSettingsPreserved, continueAfterReceiptFailure, installReceiptFailure, overwriteProgressRow, preservedRestoreArticle, receiptCountForStateHash, restoreIdentityState, seedOverwriteGlobalSettings, seedOverwriteSettings } from './desktopFramedSyncVerifiedRestoreTwoProcess.testSupport.js';
import { sourceArticleIdentity, verifiedReceiverArticle, verifiedReceiverEvidence } from './desktopFramedSyncVerifiedTwoProcess.testSupport.js';

const nodeId = 't326-verified-identity-restore-a';
const secondId = 't326-verified-identity-restore-b';
const secondContent = '\ufeffSecond resumed unit 中😀\0';
const oldId = 't326-old-restored-library';
const content = '\ufeff恢复中😀\0文'.repeat(40_000);
const oldContent = '\ufeffOld independent library 中😀\0';

it.each(['restore', 'adoption'] as const)(
  'retains completed authenticated %s units across a later receipt failure and process restart', async (mode) => {
    const fixture = await createDesktopFramedSyncTwoProcessFixture();
    let succeeded = false;
    try {
      const settings = await seedRestoreFixture(fixture);
      const sources = seedReceiverRestoreSources(fixture.rightSnapshot.databasePath, oldId, fixture.rightSnapshot.stateRoot);
      const expected = sourceArticleIdentity(fixture.leftSnapshot.databasePath, nodeId);
      const secondExpected = sourceArticleIdentity(fixture.leftSnapshot.databasePath, secondId);
      const [firstHash, secondHash] = await sourceStateHashes(fixture.left, nodeId, secondId);
      const previous = sourceArticleIdentity(fixture.rightSnapshot.databasePath, oldId);
      const args = { mode, peerOrigin: fixture.leftSnapshot.origin, peerDeviceId: 'desktop-a', restoreId: 't326-restore-round' };
      const directory = path.join(fixture.rightSnapshot.stateRoot, 'identity-restore-backups');
      expect(await fixture.right.invoke('begin_identity_restore', args)).toEqual({ directory });
      installReceiptFailure(fixture.rightSnapshot.databasePath, 1);
      await expect(fixture.right.invoke('identity_restore_round', args)).rejects.toThrow('identity_restore_receipt_rejected');
      assertReceiverConfiguration(fixture.rightSnapshot.databasePath, settings, sources);
      expect(await verifiedReceiverArticle(fixture.rightSnapshot.databasePath, nodeId)).toMatchObject({ ...expected, content });
      const failed = verifiedReceiverEvidence(fixture.rightSnapshot.databasePath, secondId);
      const completedFirst = verifiedReceiverEvidence(fixture.rightSnapshot.databasePath, nodeId);
      expect(failed.node).toBeUndefined();
      expect(failed.versions).toEqual([]);
      expect(failed.receipts).toHaveLength(1);
      expect(failed.transfers).toEqual(expect.arrayContaining([expect.objectContaining({ state: 'ready_to_apply' })]));
      expect(failed.pins.length).toBeGreaterThan(0);
      expect(verifiedReceiverEvidence(fixture.rightSnapshot.databasePath, oldId).node).toBeUndefined();
      const { progress, pending } = pendingOverwrite(fixture.rightSnapshot.databasePath, mode, args.restoreId);
      if (mode === 'restore') expect(await preservedRestoreArticle(directory, fixture.root, oldId))
        .toMatchObject({ ...previous, content: oldContent });
      const restarted = await fixture.restartRight();
      expect(restarted.snapshot.pid).not.toBe(fixture.rightSnapshot.pid);
      assertReceiverConfiguration(restarted.snapshot.databasePath, settings, sources);
      expect(verifiedReceiverEvidence(restarted.snapshot.databasePath, nodeId)).toEqual(completedFirst);
      expect(overwriteProgressRow(restarted.snapshot.databasePath)).toEqual(progress);
      expect(restoreIdentityState(restarted.snapshot.databasePath)).toEqual(pending);
      expect(await verifiedReceiverArticle(restarted.snapshot.databasePath, nodeId)).toMatchObject({ ...expected, content });
      continueAfterReceiptFailure(restarted.snapshot.databasePath, nodeId);
      expect(await fixture.right.invoke('identity_restore_round', args)).toMatchObject({ complete: true, pending: 0 });
      assertReceiverConfiguration(restarted.snapshot.databasePath, settings, sources);
      expect(await verifiedReceiverArticle(restarted.snapshot.databasePath, nodeId)).toMatchObject({ ...expected, content });
      expect(await verifiedReceiverArticle(restarted.snapshot.databasePath, secondId)).toMatchObject({ ...secondExpected, content: secondContent });
      expect(overwriteProgressRow(restarted.snapshot.databasePath)).toBeUndefined();
      const committed = verifiedReceiverEvidence(restarted.snapshot.databasePath, nodeId);
      expect(committed.node).toMatchObject({ content });
      expect(committed.receipts.length).toBeGreaterThanOrEqual(2);
      expect(receiptCountForStateHash(restarted.snapshot.databasePath, firstHash)).toBe(1);
      expect(receiptCountForStateHash(restarted.snapshot.databasePath, secondHash)).toBe(1);
      expect(committed.receipts[0]).toEqual(failed.receipts[0]);
      expect(committed.pins).toEqual([]);
      expect(committed.frames).toEqual([]);
      expect(committed.chunks).toEqual([]);
      expect(verifiedReceiverEvidence(restarted.snapshot.databasePath, oldId).node).toBeUndefined();
      assertOverwriteFinished(restarted.snapshot.databasePath, mode, args.restoreId);
      await assertGlobalSettingsAfterRestart(fixture, settings, sources);
      succeeded = true;
    } finally {
      await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
      if (succeeded) await fs.rm(fixture.root, { recursive: true, force: true });
      else console.info('Verified identity restore fixture:', fixture.root);
    }
  },
  30_000
);

async function seedRestoreFixture(fixture: Awaited<ReturnType<typeof createDesktopFramedSyncTwoProcessFixture>>) {
  await fixture.left.seed({ content, nodeId, title: 'First restored source' });
  await fixture.left.seed({ content: secondContent, nodeId: secondId, title: 'Second restored source' });
  await fixture.right.seed({ content: oldContent, nodeId: oldId, title: 'Preserved old library' });
  await fixture.right.invoke('round', { input: { kind: 'read_inventory' } });
  await seedOverwriteGlobalSettings(fixture.leftSnapshot.databasePath, 'source');
  await seedOverwriteGlobalSettings(fixture.rightSnapshot.databasePath, 'receiver');
  assertOverwriteGlobalSettings(fixture.leftSnapshot.databasePath, 'source');
  assertOverwriteGlobalSettings(fixture.rightSnapshot.databasePath, 'receiver');
  return seedOverwriteSettings(fixture.leftSnapshot.databasePath, fixture.rightSnapshot.databasePath);
}

async function assertGlobalSettingsAfterRestart(
  fixture: Awaited<ReturnType<typeof createDesktopFramedSyncTwoProcessFixture>>,
  localSettings: Awaited<ReturnType<typeof seedOverwriteSettings>>,
  localSources: ReturnType<typeof seedReceiverRestoreSources>
) {
  assertOverwriteGlobalSettings(fixture.rightSnapshot.databasePath, 'source');
  const previousPid = fixture.right.child.pid;
  const restarted = await fixture.restartRight();
  expect(restarted.snapshot.pid).not.toBe(previousPid);
  assertOverwriteGlobalSettings(restarted.snapshot.databasePath, 'source');
  assertReceiverConfiguration(restarted.snapshot.databasePath, localSettings, localSources);
}

function assertReceiverConfiguration(databasePath: string,
  settings: Awaited<ReturnType<typeof seedOverwriteSettings>>, sources: ReturnType<typeof seedReceiverRestoreSources>) {
  assertOverwriteSettingsPreserved(databasePath, settings);
  assertReceiverRestoreSourcesCleared(databasePath, sources);
}

function pendingOverwrite(databasePath: string, mode: 'restore' | 'adoption', restoreId: string) {
  const progress = overwriteProgressRow(databasePath)!;
  expect(JSON.parse(progress.value)).toEqual({ groupId: 't326-group',
    overwriteId: mode === 'restore' ? restoreId : 'desktop-b-epoch',
    providerDeviceId: 'desktop-a', providerLibraryEpoch: 'desktop-a-epoch',
    receiverDeviceId: 'desktop-b', receiverLibraryEpoch: mode === 'restore' ? restoreId : 'desktop-b-epoch' });
  const pending = restoreIdentityState(databasePath);
  if (mode === 'restore') expect(pending.restores).toEqual([expect.objectContaining({ restore_id: restoreId, applied_at: null })]);
  else expect(pending.metadata).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'sync_group_local_adoption' })]));
  return { progress, pending };
}

function assertOverwriteFinished(databasePath: string, mode: 'restore' | 'adoption', restoreId: string) {
  const identity = restoreIdentityState(databasePath);
  if (mode === 'restore') expect(identity.restores).toEqual([expect.objectContaining({ restore_id: restoreId, applied_at: expect.any(String) })]);
  else {
    expect(identity.metadata).not.toEqual(expect.arrayContaining([expect.objectContaining({ key: 'sync_group_local_adoption' })]));
    expect(identity.metadata).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'sync_group_completed_adoption' })]));
  }
}

async function sourceStateHashes(process: Parameters<typeof readFixtureInventory>[0], firstId: string, secondId: string) {
  const entries = await readFixtureInventory(process);
  const hash = (id: string) => Buffer.from(entries.find(entry => entry.globalId === id)!.sharedStateHash).toString('hex');
  return [hash(firstId), hash(secondId)] as const;
}
