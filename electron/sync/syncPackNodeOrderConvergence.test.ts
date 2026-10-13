// @vitest-environment node
import { expect, it } from 'vitest';

import { ROOT_CHILD_ORDER_ID } from '../../lib/core/database/parentChildOrder.js';
import { currentParentOrderHash, currentParentOrderPayload } from '../../lib/core/sync/currentParentOrder.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import { restoreFixture } from '../database/requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { sendCurrentObject } from './currentRequestLearning.testSupport.js';

it('applies and replays a parent sequence independently of article versions and retired ranking', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const record = textBranch('original', 'Original body'); record.snapshot.position = 5;
    await applySyncNodesWithDbPort(source.db, [record]);
    await sendCurrentObject(source, target);
    const versions = target.sqlite.prepare('SELECT * FROM node_sync_versions').all();
    const sources = [{ authorId: 'desktop-host', counter: 1, childIds: ['topic'] }];
    await source.db.transaction(db => applySyncObjectInTransaction(db, {
      object_type: 'parent_child_order', object_id: ROOT_CHILD_ORDER_ID,
      content_hash: currentParentOrderHash(ROOT_CHILD_ORDER_ID, sources),
      payload_json: JSON.stringify(currentParentOrderPayload(ROOT_CHILD_ORDER_ID, sources)),
      updated_at: '2026-05-04T01:02:00.000Z', deleted_at: null
    }));
    for (let replay = 0; replay < 2; replay++) {
      await sendCurrentObject(source, target, 'parent_child_order', ROOT_CHILD_ORDER_ID);
      await sendCurrentObject(source, target); target.reopen();
      expect(target.sqlite.prepare('SELECT child_ids_json FROM parent_child_order WHERE parent_id = ?').get(ROOT_CHILD_ORDER_ID))
        .toEqual({ child_ids_json: '["topic"]' });
      expect(target.sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'node_order'").all()).toEqual([]);
      expect(target.sqlite.prepare('SELECT * FROM node_sync_versions').all()).toEqual(versions);
    }
  } finally { await fixture.close(); }
});
