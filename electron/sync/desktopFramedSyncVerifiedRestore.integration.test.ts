// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const notification = vi.hoisted(() => vi.fn());
vi.mock('./workspaceSyncAppliedEvents.js', () => ({ notifyWorkspaceSyncApplied: notification }));

import { loadSyncGroupLocalAdoption, SYNC_GROUP_COMPLETED_ADOPTION_KEY } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { loadLatestSyncGroupRestoreEvent } from '../../lib/core/sync/syncGroupRestoreEvents.js';

import { loadDesktopFramedSyncReadyFacts } from './desktopFramedSyncReadyFacts.js';
import { applyVerifiedDesktopFramedSyncInbound } from './desktopFramedSyncVerifiedApply.js';
import { verifiedRestoreEvidence, verifiedRestoreFixture, verifiedRestoreRows } from './desktopFramedSyncVerifiedRestore.testSupport.js';

beforeEach(() => notification.mockClear());

it.each(['restore', 'adoption'] as const)('commits %s owner handoff before releasing ready pins', async (path) => {
  const host = await verifiedRestoreFixture(path);
  try {
    const result = await applyVerifiedDesktopFramedSyncInbound({ db: host.db, transfers: [host.transfer], ...host.input });
    expect(result.receipts).toHaveLength(1);
    expect(result.removedNodeIds).toContain('old-node');
    const evidence = await verifiedRestoreEvidence(host);
    expect(evidence.current.metadata.version_id).toBe(host.record.version_id);
    expect(evidence.bodies).toEqual(evidence.expectedBodies);
    expect(evidence.oldBody).toBeNull();
    expect(evidence.oldManifest).toBeUndefined();
    expect(evidence.incomingIds).toEqual(['surviving']);
    expect(evidence.cacheHash).toBe(host.cacheHash);
    expect(host.driver.queryOne("SELECT id FROM nodes WHERE id = 'old-node'")).toBeUndefined();
    expect(host.driver.queryAll('SELECT * FROM framed_sync_blob_pins')).toEqual([]);
    expect(await loadDesktopFramedSyncReadyFacts(host.db, host.published)).toBeNull();
    if (path === 'adoption') {
      expect(await loadSyncGroupLocalAdoption(host.db)).toBeNull();
      expect(host.driver.queryOne('SELECT value FROM sync_group_metadata WHERE key = ?', [SYNC_GROUP_COMPLETED_ADOPTION_KEY])).toBeDefined();
    } else expect(await loadLatestSyncGroupRestoreEvent(host.db, host.published.context.groupId)).toMatchObject({ applied: true });
    expect(notification).toHaveBeenCalledTimes(1);
    expect(notification).toHaveBeenCalledWith(expect.objectContaining({ appliedNodeIds: expect.arrayContaining(['old-node', 'topic']) }));
  } finally { host.sqlite.close(); }
});

it.each(['restore', 'adoption'] as const)('rolls back a late %s receipt failure and retries the same ready transfer', async (path) => {
  const host = await verifiedRestoreFixture(path);
  try {
    const before = verifiedRestoreRows(host);
    host.sqlite.exec(`CREATE TRIGGER reject_restore_receipt BEFORE INSERT ON framed_sync_receipts
      BEGIN SELECT RAISE(ABORT, 'restore_receipt_rejected'); END`);
    await expect(applyVerifiedDesktopFramedSyncInbound({ db: host.db, transfers: [host.transfer], ...host.input }))
      .rejects.toThrow('restore_receipt_rejected');
    expect(verifiedRestoreRows(host)).toEqual(before);
    expect(notification).not.toHaveBeenCalled();
    expect(await host.staging.loadReceipt(host.published.transferId)).toBeNull();
    const retry = await loadDesktopFramedSyncReadyFacts(host.db, host.published);
    expect(retry).toEqual(host.transfer);
    host.sqlite.exec('DROP TRIGGER reject_restore_receipt');
    if (!retry) throw new Error('ready retry missing');
    expect((await applyVerifiedDesktopFramedSyncInbound({ db: host.db, transfers: [retry], ...host.input })).receipts).toHaveLength(1);
    const evidence = await verifiedRestoreEvidence(host);
    expect(evidence.bodies).toEqual(evidence.expectedBodies);
    expect(evidence.oldBody).toBeNull();
    expect(evidence.oldManifest).toBeUndefined();
    expect(evidence.incomingIds).toEqual(['surviving']);
    expect(host.driver.queryAll('SELECT * FROM framed_sync_blob_pins')).toEqual([]);
    expect(notification).toHaveBeenCalledTimes(1);
  } finally { host.sqlite.close(); }
});
