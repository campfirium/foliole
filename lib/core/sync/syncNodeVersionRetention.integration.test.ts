// @vitest-environment node
import { expect, it } from 'vitest';

import { textBranch, textDevice } from '../../../electron/database/topicTextState.testSupport.js';
import { hashTextBody } from '../database/textBodyHash.js';

import type { DbPort } from './dbPort.js';
import { applySyncNodesWithDbPort } from './syncNodeApplyExecutor.js';
import { loadRetainedSyncNodeVersionFact } from './syncNodeGraph.js';

it.each([false, true])('retains ordered parent edges once and rolls them back on failure (count triggers: %s)', async countTriggers => {
  const sender = textDevice();
  const receiver = textDevice();
  try {
    const totalChanges = receiver.sqlite.prepare('SELECT total_changes()').pluck();
    const observe = (db: DbPort): DbPort => ({
      ...db,
      async run(sql, params) {
        const before = Number(totalChanges.get());
        const result = await db.run(sql, params);
        return { ...result, changes: Number(totalChanges.get()) - before };
      },
      transaction: task => db.transaction(tx => task(observe(tx)))
    });
    const target = countTriggers ? observe(receiver.db) : receiver.db;
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
    await expect(applySyncNodesWithDbPort(target, records)).rejects.toThrow('reject_current');
    expect(await receiver.current()).toBeNull();
    expect(receiver.sqlite.prepare('SELECT version_id FROM node_sync_versions').all()).toEqual([]);
    expect(attempts()).toEqual([]);

    receiver.sqlite.exec('DROP TRIGGER reject_current');
    for (let delivery = 0; delivery < 2; delivery++) {
      receiver.sqlite.exec('DELETE FROM edge_attempts');
      await applySyncNodesWithDbPort(target, records);
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

it('rejects a mismatched immutable body or claimed hash on re-delivery of a complete version', async () => {
  const sender = textDevice();
  const receiver = textDevice();
  try {
    await applySyncNodesWithDbPort(sender.db, [textBranch('head', 'current body')]);
    const record = (await loadRetainedSyncNodeVersionFact(sender.db, 'head', false))!;
    await applySyncNodesWithDbPort(receiver.db, [record]);
    const before = await receiver.current();
    await expect(applySyncNodesWithDbPort(receiver.db, [{ ...record, body_text: 'Wrong bytes' }]))
      .rejects.toThrow('sync_pack_node_version_immutable_mismatch');
    const wrongHash = { ...record, snapshot: { ...record.snapshot, body_blob_hash: hashTextBody('other bytes') } };
    await expect(applySyncNodesWithDbPort(receiver.db, [wrongHash]))
      .rejects.toThrow('sync_node_version_body_hash_mismatch');
    expect(await receiver.current()).toEqual(before);
    expect(await loadRetainedSyncNodeVersionFact(receiver.db, 'head', false)).toEqual(record);
  } finally {
    receiver.sqlite.close();
    sender.sqlite.close();
  }
});

it.each(['complete', 'retired'])('backfills a missing retired hash from a %s delivery without restoring its body',
  async delivery => {
    const receiver = textDevice();
    try {
      const base = textBranch('base', 'original');
      const current = textBranch('head', 'current body', base);
      await applySyncNodesWithDbPort(receiver.db, [base, current]);
      const retired = { ...base, body_text: null, snapshot: { ...base.snapshot, content: null, body_deleted: true } };
      await applySyncNodesWithDbPort(receiver.db, [retired]);
      const read = () => receiver.sqlite.prepare(`SELECT body_text, json_extract(snapshot_json, '$.body_deleted') AS retired,
        json_extract(snapshot_json, '$.body_blob_hash') AS hash FROM node_sync_versions WHERE version_id = 'base'`).get();
      const hash = hashTextBody(base.body_text!);
      expect(read()).toEqual({ body_text: null, retired: 1, hash });
      receiver.sqlite.prepare(`UPDATE node_sync_versions SET snapshot_json = json_remove(snapshot_json, '$.body_blob_hash')
        WHERE version_id = 'base'`).run();
      const incoming = delivery === 'retired' ? { ...retired, snapshot: { ...retired.snapshot, body_blob_hash: hash } } : base;
      const receive = () => applySyncNodesWithDbPort(receiver.db, [incoming]);
      await receive();
      await receive();
      expect(read()).toEqual({ body_text: null, retired: 1, hash });
      expect(await receiver.current()).toMatchObject({ body_text: 'current body', version_id: 'head' });
    } finally { receiver.sqlite.close(); }
  });
