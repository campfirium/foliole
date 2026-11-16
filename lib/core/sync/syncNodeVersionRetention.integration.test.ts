// @vitest-environment node
import { expect, it } from 'vitest';

import { textBranch, textDevice } from '../../../electron/database/topicTextState.testSupport.js';

import { applySyncNodesWithDbPort } from './syncNodeApplyExecutor.js';
import { loadRetainedSyncNodeVersionFact } from './syncNodeGraph.js';

it('retains ordered parent edges once per receive and rolls them back with a failed current apply', async () => {
  const sender = textDevice();
  const receiver = textDevice();
  try {
    const root = textBranch('root', 'original');
    const left = textBranch('left', 'left branch', root);
    const right = textBranch('right', 'right branch', root);
    const head = textBranch('head', 'merged body 中文', left);
    head.parent_version_ids = ['left', 'right'];
    await applySyncNodesWithDbPort(sender.db, [head, right, left, root]);
    const records = await Promise.all([head, right, left, root].map(async (record) =>
      (await loadRetainedSyncNodeVersionFact(sender.db, record.version_id!, false))!));

    receiver.sqlite.exec(`
      CREATE TEMP TABLE edge_attempts (parent_version_id TEXT);
      CREATE TEMP TRIGGER count_head_edges BEFORE INSERT ON node_sync_version_parents
      WHEN NEW.version_id = 'head'
      BEGIN INSERT INTO edge_attempts VALUES (NEW.parent_version_id); END;
      CREATE TEMP TRIGGER reject_current BEFORE INSERT ON nodes
      BEGIN SELECT RAISE(ABORT, 'reject_current'); END;
    `);
    const attempts = () => receiver.sqlite.prepare('SELECT parent_version_id FROM edge_attempts ORDER BY rowid')
      .pluck().all();
    await expect(applySyncNodesWithDbPort(receiver.db, records)).rejects.toThrow('reject_current');
    expect(await receiver.current()).toBeNull();
    expect(receiver.sqlite.prepare('SELECT version_id FROM node_sync_versions').all()).toEqual([]);
    expect(attempts()).toEqual([]);

    receiver.sqlite.exec('DROP TRIGGER reject_current');
    for (let delivery = 0; delivery < 2; delivery++) {
      receiver.sqlite.exec('DELETE FROM edge_attempts');
      await applySyncNodesWithDbPort(receiver.db, records);
      expect(await receiver.current()).toMatchObject({
        body_text: 'merged body 中文', version_id: 'head', parent_version_ids: ['left', 'right']
      });
      expect(receiver.sqlite.prepare('SELECT version_id FROM node_sync_versions ORDER BY version_id')
        .pluck().all()).toEqual(['head', 'left', 'right', 'root']);
      expect(attempts()).toEqual(['left', 'right']);
    }
  } finally {
    receiver.sqlite.close();
    sender.sqlite.close();
  }
});

it('still rejects a newly received body with a mismatched hash and rolls back its version', async () => {
  const receiver = textDevice();
  try {
    const record = textBranch('head', 'current body');
    record.snapshot.body_blob_hash = '0'.repeat(64);
    await expect(applySyncNodesWithDbPort(receiver.db, [record]))
      .rejects.toThrow('sync_node_version_body_hash_mismatch');
    expect(await receiver.current()).toBeNull();
    expect(await loadRetainedSyncNodeVersionFact(receiver.db, 'head', false)).toBeNull();

    delete record.snapshot.body_blob_hash;
    await applySyncNodesWithDbPort(receiver.db, [record]);
    expect(await receiver.current()).toMatchObject({ body_text: 'current body', version_id: 'head' });
  } finally {
    receiver.sqlite.close();
  }
});
