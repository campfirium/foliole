// @vitest-environment node
import { expect, it } from 'vitest';

import { ROOT_CHILD_ORDER_ID } from '../../lib/core/database/parentChildOrder.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { currentParentOrderHash, currentParentOrderPayload } from '../../lib/core/sync/currentParentOrder.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { restoreFramedSyncObjectStateFact, selectFramedSyncObjectStateFact } from '../../lib/core/sync/framedSyncObjectStateFact.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';

import { restoreFixture, transfer } from './requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from './topicTextState.testSupport.js';

it.each(['node_open_state', 'parent_child_order'] as const)(
  'preserves %s through its current node dependency contract', async type => {
    const fixture = await restoreFixture();
    const source = fixture.peer('source'); const target = fixture.peer('target');
    try {
      const record = textBranch('folder-version', ''); record.snapshot.kind = 'folder';
      await applySyncNodesWithDbPort(source.db, [record]);
      const id = type === 'node_open_state' ? 'topic' : ROOT_CHILD_ORDER_ID;
      const sources = [{ authorId: 'source', counter: 1, childIds: ['topic'] }];
      const payload = type === 'node_open_state' ? { node_id: id, last_opened_at: '2026-10-09T09:00:00.000Z' }
        : currentParentOrderPayload(id, sources);
      const hash = type === 'node_open_state' ? computeSyncContentHash(type, payload) : currentParentOrderHash(id, sources);
      await source.db.transaction(db => applySyncObjectInTransaction(db, { object_type: type, object_id: id,
        payload_json: JSON.stringify(payload), content_hash: hash, updated_at: '2026-10-11', deleted_at: null }));
      const original = await selectFramedSyncObjectStateFact(source.db, { globalId: id, objectType: type }, `${type}:${hash}`);
      const differences = compareFramedSyncInventories({ local: await readRequestSyncInventorySnapshot(source.db), remote: [] });
      const state = differences.find(value => value.objectType === type);
      const node = differences.find(value => value.objectType === 'node' && value.globalId === 'topic');
      if (!node || (type === 'parent_child_order' && !state)) throw new Error('dependency_fixture_inventory_missing');
      const progress = { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
        providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch };
      if (type === 'node_open_state') {
        expect(state).toBeUndefined();
        expect(node.need.stateFactIds).toContain(JSON.stringify([type, id, hash]));
      } else {
        await transfer(source, target, progress, state!);
        expect(target.sqlite.prepare('SELECT child_ids_json FROM parent_child_order WHERE parent_id = ?').pluck().get(id)).toBe('[]');
      }
      await transfer(source, target, progress, node);
      if (state) await transfer(source, target, progress, state);
      target.reopen();
      expect(target.sqlite.prepare("SELECT kind, content FROM nodes WHERE id = 'topic'").get())
        .toEqual({ kind: 'folder', content: '' });
      const saved = await selectFramedSyncObjectStateFact(target.db, { globalId: id, objectType: type }, `${type}:${hash}`);
      if (type === 'node_open_state') expect(saved).toEqual(original);
      else {
        const sourceState = restoreFramedSyncObjectStateFact(original);
        expect(restoreFramedSyncObjectStateFact(saved)).toMatchObject({ object_id: sourceState.object_id,
          content_hash: sourceState.content_hash, current_version_id: sourceState.current_version_id,
          payload_json: sourceState.payload_json, deleted_at: sourceState.deleted_at });
      }
      if (type === 'node_open_state') expect(target.sqlite.prepare("SELECT last_opened_at FROM node_open_state WHERE node_id = 'topic'").pluck().get())
        .toBe('2026-10-09T09:00:00.000Z');
      else expect(target.sqlite.prepare('SELECT child_ids_json FROM parent_child_order WHERE parent_id = ?').pluck().get(id))
        .toBe('["topic"]');
    } finally { await fixture.close(); }
  });
