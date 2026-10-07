// @vitest-environment node
import { expect, it } from 'vitest';

import { observeReads, referencedNode } from '../../../electron/database/syncNodeVerifiedTopicConflict.testSupport.js';
import { textBranch, textDevice } from '../../../electron/database/topicTextState.testSupport.js';
import { migrateBodyContentStorage } from '../database/bodyContentMigration.js';
import { migrateBodyContentOwners } from '../database/bodyContentOwnerMigration.js';
import { hashTextBody } from '../database/textBodyHash.js';

import { reviveDeletedFoldersForLaterChildren } from './syncFolderChildRevival.js';
import { upsertRemoteVersion } from './syncNodeApplyAcceptedRemote.js';
import { applySyncNodesWithDbPort } from './syncNodeApplyExecutor.js';
import { expireVerifiedTopicText, reviveDeletedFoldersForVerifiedChildren } from './syncNodeVerifiedLifecycle.js';
import { expireTopicText } from './topicTextExpiry.js';

const before = '2026-10-07T00:00:00.000Z';
const deletedAt = '2026-10-07T02:00:00.000Z';
const after = '2026-10-07T03:00:00.000Z';

async function migrate(host: ReturnType<typeof textDevice>) {
  await host.db.transaction(async (tx) => {
    await migrateBodyContentStorage(tx);
    await migrateBodyContentOwners(tx, 'desktop');
  });
}

function persisted(host: ReturnType<typeof textDevice>) {
  return {
    nodes: host.sqlite.prepare('SELECT id, current_version_id, deleted_at, body_blob_hash, sync_dirty FROM nodes ORDER BY id').all(),
    versions: host.sqlite.prepare('SELECT version_id, parent_version_id, content_hash FROM node_sync_versions ORDER BY version_id').all(),
    parents: host.sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id, parent_version_id').all(),
    state: host.sqlite.prepare('SELECT * FROM sync_object_state ORDER BY object_id').all()
  };
}

it.each([before, after])('preserves expiry decisions, selection and successor identity at %s', async (now) => {
  const old = textDevice();
  const stable = textDevice();
  try {
    const body = '中文🙂'.repeat(300000);
    const alternative = '另一整版\0'.repeat(300000);
    const current = textBranch('selected', body, undefined, before);
    current.snapshot.text_alternatives = [{ id: 'alternative', body_blob_hash: hashTextBody(alternative),
      source_host_name: 'other', created_at: before, expires_at: deletedAt }];
    current.alternative_bodies = [{ hash: hashTextBody(alternative), text: alternative }];
    for (const host of [old, stable]) await applySyncNodesWithDbPort(host.db, [current]);
    await migrate(stable);
    const reads = observeReads(stable.db);
    await expireTopicText(old.db, 'topic', now);
    await expireVerifiedTopicText(reads.port, 'topic', now);
    expect(persisted(stable)).toEqual(persisted(old));
    expect(Math.max(0, ...reads.sizes)).toBeLessThanOrEqual(512 * 1024);
    const row = stable.sqlite.prepare('SELECT snapshot_json FROM node_sync_versions WHERE version_id = (SELECT current_version_id FROM nodes WHERE id = ?)').get('topic') as { snapshot_json: string };
    expect(JSON.parse(row.snapshot_json).text_selection).toEqual(current.snapshot.text_selection);
    expect(JSON.parse(row.snapshot_json).text_alternatives).toHaveLength(now === before ? 1 : 0);
  } finally { old.sqlite.close(); stable.sqlite.close(); }
});

function folderAndChild(samePlacement: boolean, createdAt: string) {
  const folder = textBranch('folder-version', 'Folder body', undefined, deletedAt);
  folder.object_id = 'folder';
  folder.snapshot = { ...folder.snapshot, id: 'folder', kind: 'folder', deleted_at: deletedAt };
  const previous = textBranch('previous-child', 'Child body', undefined, before);
  previous.snapshot.parent_id = samePlacement ? 'folder' : null;
  const child = textBranch('later-child', 'Child body', previous, createdAt);
  child.snapshot.parent_id = 'folder';
  return { folder, previous, child };
}

it.each([false, true])('preserves deleted-folder revival with same-placement=%s and all temporal boundaries', async (samePlacement) => {
  for (const createdAt of [before, deletedAt, after]) {
    const old = textDevice();
    const stable = textDevice();
    try {
      const { folder, previous, child } = folderAndChild(samePlacement, createdAt);
      for (const host of [old, stable]) {
        await applySyncNodesWithDbPort(host.db, [folder]);
        await upsertRemoteVersion(host.db, previous);
      }
      await migrate(stable);
      const record = await referencedNode(stable.db, child);
      const reads = observeReads(stable.db);
      stable.sqlite.prepare('DELETE FROM search_index_invalidations').run();
      await reviveDeletedFoldersForLaterChildren(old.db, [child], new Set(['topic']));
      await reviveDeletedFoldersForVerifiedChildren(reads.port, [record], new Set(['topic']));
      expect(persisted(stable)).toEqual(persisted(old));
      expect(Math.max(0, ...reads.sizes)).toBeLessThanOrEqual(512 * 1024);
      const restored = !samePlacement && createdAt === after;
      expect(stable.sqlite.prepare("SELECT deleted_at FROM nodes WHERE id = 'folder'").pluck().get()).toBe(restored ? null : deletedAt);
      expect(stable.sqlite.prepare("SELECT count(*) FROM search_index_invalidations WHERE target_id = 'folder'").pluck().get()).toBe(restored ? 1 : 0);
    } finally { old.sqlite.close(); stable.sqlite.close(); }
  }
});

it('rolls back revival current/version/parents/search when the durable invalidation fails', async () => {
  const host = textDevice();
  try {
    const { folder, previous, child } = folderAndChild(false, after);
    await applySyncNodesWithDbPort(host.db, [folder]);
    await upsertRemoteVersion(host.db, previous);
    await migrate(host);
    const record = await referencedNode(host.db, child);
    const initial = persisted(host);
    host.sqlite.exec("CREATE TRIGGER reject_folder_search BEFORE INSERT ON search_index_invalidations BEGIN SELECT RAISE(ABORT, 'reject_search'); END");
    await expect(reviveDeletedFoldersForVerifiedChildren(observeReads(host.db).port, [record], new Set(['topic']))).rejects.toThrow('reject_search');
    expect(persisted(host)).toEqual(initial);
    host.sqlite.exec('DROP TRIGGER reject_folder_search');
    await reviveDeletedFoldersForVerifiedChildren(host.db, [record], new Set(['topic']));
    expect(host.sqlite.prepare("SELECT deleted_at FROM nodes WHERE id = 'folder'").pluck().get()).toBeNull();
  } finally { host.sqlite.close(); }
});

it('rejects full-body reads in the old expiry and revival paths at the real database boundary', async () => {
  const host = textDevice();
  try {
    const current = textBranch('selected', '中文🙂'.repeat(300000), undefined, before);
    const alternative = 'Alternative';
    current.snapshot.text_alternatives = [{ id: 'alternative', body_blob_hash: hashTextBody(alternative),
      source_host_name: 'other', created_at: before, expires_at: deletedAt }];
    current.alternative_bodies = [{ hash: hashTextBody(alternative), text: alternative }];
    await applySyncNodesWithDbPort(host.db, [current]);
    await expect(expireTopicText(observeReads(host.db).port, 'topic', after)).rejects.toThrow('unexpected_full_body_read');
    const { folder, previous, child } = folderAndChild(false, after);
    await applySyncNodesWithDbPort(host.db, [folder]);
    await upsertRemoteVersion(host.db, previous);
    await expect(reviveDeletedFoldersForLaterChildren(observeReads(host.db).port, [child], new Set(['topic'])))
      .rejects.toThrow('unexpected_full_body_read');
  } finally { host.sqlite.close(); }
});

it('rolls back expiry version, owners and selection when current adoption fails, then retries', async () => {
  const host = textDevice();
  try {
    const current = textBranch('selected', 'Main body', undefined, before);
    const alternative = 'Alternative';
    current.snapshot.text_alternatives = [{ id: 'alternative', body_blob_hash: hashTextBody(alternative),
      source_host_name: 'other', created_at: before, expires_at: deletedAt }];
    current.alternative_bodies = [{ hash: hashTextBody(alternative), text: alternative }];
    await applySyncNodesWithDbPort(host.db, [current]);
    await migrate(host);
    const initial = persisted(host);
    const bodies = host.sqlite.prepare('SELECT hash FROM content_bodies ORDER BY hash').all();
    host.sqlite.exec("CREATE TRIGGER reject_expiry BEFORE UPDATE OF current_version_id ON nodes BEGIN SELECT RAISE(ABORT, 'reject_expiry'); END");
    await expect(expireVerifiedTopicText(observeReads(host.db).port, 'topic', after)).rejects.toThrow('reject_expiry');
    expect(persisted(host)).toEqual(initial);
    expect(host.sqlite.prepare('SELECT hash FROM content_bodies ORDER BY hash').all()).toEqual(bodies);
    host.sqlite.exec('DROP TRIGGER reject_expiry');
    await expireVerifiedTopicText(host.db, 'topic', after);
    expect(host.sqlite.prepare("SELECT current_version_id FROM nodes WHERE id = 'topic'").pluck().get()).not.toBe('selected');
  } finally { host.sqlite.close(); }
});
