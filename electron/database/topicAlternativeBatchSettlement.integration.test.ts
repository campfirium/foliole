// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import type { TopicAlternativeRecord } from '../../lib/core/sync/topicAlternativeRecord.js';
import { settleTopicAlternatives, settleTopicAlternativesForNodes, writeTopicAlternative } from '../../lib/core/sync/topicAlternativeStore.js';

import { textBranch, textDevice } from './topicTextState.testSupport.js';

const hosts: ReturnType<typeof textDevice>[] = [];
const now = '2026-11-06T12:00:00.000Z';
const heads = ['topic', 'second', 'empty'].map(id => ({ id, body_blob_hash: hashTextBody(`Main ${id}`) }));
afterEach(() => hosts.splice(0).forEach(host => host.sqlite.close()));

async function seeded() {
  const host = textDevice();
  hosts.push(host);
  for (const id of [...heads.map(head => head.id), 'unaffected']) {
    const branch = textBranch(`base-${id}`, `Main ${id}`, undefined, now);
    await host.receive([{ ...branch, object_id: id, snapshot: { ...branch.snapshot, id } }]);
    if (id === 'empty') continue;
    for (let index = 0; index < 8; index++) {
      const body = index === 0 ? `Main ${id}` : index === 7 ? 'Choice 6' : `Choice ${index}`;
      const record: TopicAlternativeRecord = {
        alternative_id: `${id}-${index}`, node_id: id, source_version_id: `source-${index}`,
        body_text: body, body_blob_hash: hashTextBody(body), source_host_name: 'desktop',
        created_at: `2026-11-06T11:00:0${index}.000Z`, updated_at: now,
        expires_at: index === 1 ? now : '2026-11-07T12:00:00.000Z', status: 'available',
        resource_references: '[]', image_sources: null
      };
      await writeTopicAlternative(host.db, record, true);
    }
  }
  return host;
}

function persisted(host: ReturnType<typeof textDevice>) {
  return {
    choices: host.sqlite.prepare('SELECT * FROM node_text_alternatives ORDER BY alternative_id').all(),
    states: host.sqlite.prepare(`SELECT object_id, content_hash, updated_at, deleted_at, sync_dirty
      FROM sync_object_state WHERE object_type = 'node_text_alternative' ORDER BY object_id`).all()
  };
}

it('settles multiple topics like individual settlement and leaves unrelated owners unchanged', async () => {
  const individual = await seeded();
  const batch = await seeded();
  const untouched = batch.sqlite.prepare("SELECT * FROM node_text_alternatives WHERE node_id = 'unaffected'").all();
  await individual.db.transaction(async tx => {
    for (const head of heads) await settleTopicAlternatives(tx, head.id, head.body_blob_hash, now);
  });
  await batch.db.transaction(tx => settleTopicAlternativesForNodes(tx, heads, now));
  expect(persisted(batch)).toEqual(persisted(individual));
  for (const head of heads.slice(0, 2)) {
    expect(batch.sqlite.prepare("SELECT count(*) AS n FROM node_text_alternatives WHERE node_id = ? AND status = 'available'")
      .get(head.id)).toEqual({ n: 3 });
    expect(batch.sqlite.prepare('SELECT status, body_text FROM node_text_alternatives WHERE alternative_id = ?')
      .get(`${head.id}-1`)).toEqual({ status: 'expired', body_text: '' });
    expect(batch.sqlite.prepare('SELECT status FROM node_text_alternatives WHERE alternative_id = ?')
      .get(`${head.id}-0`)).toEqual({ status: 'superseded' });
  }
  expect(batch.sqlite.prepare("SELECT * FROM node_text_alternatives WHERE node_id = 'unaffected'").all()).toEqual(untouched);
  const settled = persisted(batch);
  await batch.db.transaction(tx => settleTopicAlternativesForNodes(tx, heads, now));
  expect(persisted(batch)).toEqual(settled);
});

it('rolls back retirement and publication together and retries on the same database', async () => {
  const host = await seeded();
  const before = persisted(host);
  host.sqlite.exec(`CREATE TRIGGER reject_retirement BEFORE UPDATE ON sync_object_state
    WHEN NEW.object_id = 'second-0' BEGIN SELECT RAISE(ABORT, 'retirement_rejected'); END`);
  await expect(host.db.transaction(tx => settleTopicAlternativesForNodes(tx, heads, now)))
    .rejects.toThrow('retirement_rejected');
  expect(persisted(host)).toEqual(before);
  host.sqlite.exec('DROP TRIGGER reject_retirement');
  await host.db.transaction(tx => settleTopicAlternativesForNodes(tx, heads, now));
  expect(persisted(host)).not.toEqual(before);
});

it('does no database work for an empty batch', async () => {
  const fail = () => { throw new Error('unexpected_database_call'); };
  const db: DbPort = { run: fail, query: fail, transaction: fail };
  await settleTopicAlternativesForNodes(db, [], now);
});
