// @vitest-environment node
import { expect, it } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { buildCanonicalSyncTombstone } from '../../lib/core/sync/canonicalSyncTombstone.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';

import { restoreFixture, transfer, type RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';

const createdAt = '2026-10-13T00:00:00.000Z';
const deletedAt = '2026-10-13T00:01:00.000Z';

async function writePage(peer: RestorePeer, attachmentId: string, page: number, deleted = false) {
  const objectId = `${attachmentId}:${page}`;
  const payload = deleted ? buildCanonicalSyncTombstone(objectId) : {
    attachment_id: attachmentId, page, text: `Complete ${attachmentId} page ${page} 中文`,
    page_width: 612 + page, page_height: 792 + page
  };
  await peer.db.transaction(db => applySyncObjectInTransaction(db, {
    object_type: 'pdf_page_text', object_id: objectId,
    content_hash: computeSyncContentHash('pdf_page_text', payload), payload_json: JSON.stringify(payload),
    updated_at: deleted ? deletedAt : createdAt, deleted_at: deleted ? deletedAt : null
  }));
}

async function send(source: RestorePeer, target: RestorePeer) {
  const differences = compareFramedSyncInventories({ local: await readFramedSyncInventory(source.db), remote: [] });
  for (const difference of differences) await transfer(source, target, {
    groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
    providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch
  }, difference);
}

function pages(peer: RestorePeer) {
  return peer.sqlite.prepare('SELECT * FROM pdf_page_text ORDER BY attachment_id, page').all();
}

it('deletes only the requested PDF page while preserving other pages through replay and reopen', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source');
  const target = fixture.peer('target');
  try {
    for (const page of [1, 2, 3]) await writePage(source, 'pdf-main', page);
    await writePage(source, 'pdf-other', 2);
    await send(source, target);
    expect(pages(target)).toEqual(pages(source));
    const unchangedPages = target.sqlite.prepare(
      "SELECT * FROM pdf_page_text WHERE attachment_id != 'pdf-main' OR page != 2 ORDER BY attachment_id, page"
    ).all();
    expect(unchangedPages).toHaveLength(3);
    await writePage(source, 'pdf-main', 2, true);
    for (let replay = 0; replay < 2; replay++) {
      await send(source, target);
      target.reopen();
      expect(pages(target)).toEqual(unchangedPages);
      expect(pages(source)).toEqual(unchangedPages);
      expect(target.sqlite.prepare(
        "SELECT deleted_at FROM sync_object_state WHERE object_type = 'pdf_page_text' AND object_id = 'pdf-main:2'"
      ).pluck().get()).toBe(deletedAt);
    }
  } finally { await fixture.close(); }
});
