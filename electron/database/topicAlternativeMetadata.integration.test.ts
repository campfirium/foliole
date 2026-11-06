// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import type { DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import { applyTopicAlternativeRecord } from '../../lib/core/sync/topicAlternativeApply.js';
import { topicAlternativeHash, type TopicAlternativeRecord } from '../../lib/core/sync/topicAlternativeRecord.js';
import { settleTopicAlternatives, writeTopicAlternative } from '../../lib/core/sync/topicAlternativeStore.js';
import { expireTopicText } from '../../lib/core/sync/topicTextExpiry.js';
import { mutateTopicText } from '../../lib/core/sync/topicTextMutation.js';

import { textBranch, textDevice } from './topicTextState.testSupport.js';

const hosts: ReturnType<typeof textDevice>[] = [];
afterEach(() => hosts.splice(0).forEach(host => host.sqlite.close()));

function observeReads(db: DbPort) {
  let bytes = 0;
  function observe(source: DbPort): DbPort {
    return {
      run: (sql, params) => source.run(sql, params),
      async query<T extends DbRow>(sql: string, params?: Parameters<DbPort['query']>[1]) {
        const rows = await source.query<T>(sql, params);
        for (const row of rows) if (typeof row.body_text === 'string') bytes += Buffer.byteLength(row.body_text);
        return rows;
      },
      transaction: execute => source.transaction(tx => execute(observe(tx)))
    };
  }
  return { port: observe(db), bodyBytes: () => bytes };
}

function candidate(id: string, now: string, body = 'Large alternative '.repeat(4096)): TopicAlternativeRecord {
  return { alternative_id: id, node_id: 'topic', source_version_id: 'source', body_text: body,
    body_blob_hash: hashTextBody(body), source_host_name: 'desktop', created_at: now,
    expires_at: new Date(Date.parse(now) + 86400000).toISOString(), status: 'available', updated_at: now,
    resource_references: '[]', image_sources: null };
}

it('settles, expires and discards alternatives without loading their body or the main body', async () => {
  const host = textDevice();
  hosts.push(host);
  const now = new Date().toISOString();
  await host.receive([textBranch('base', 'Main article '.repeat(4096))]);
  for (let index = 0; index < 5; index++) await writeTopicAlternative(host.db,
    candidate(`choice-${index}`, now, `${index} ${'Body '.repeat(4096)}`), true);
  const observed = observeReads(host.db);
  const choices = await settleTopicAlternatives(observed.port, 'topic', hashTextBody('Main'), now);
  expect(choices).toHaveLength(3);
  await mutateTopicText(observed.port, { nodeId: 'topic', alternativeId: choices[0]!.id,
    action: 'dismissed', now, versionId: 'unused', hostName: 'desktop' });
  await expireTopicText(observed.port, 'topic', new Date(Date.parse(now) + 172800000).toISOString());
  expect(await host.alternatives()).toEqual([]);
  expect(observed.bodyBytes()).toBe(0);
  expect(host.sqlite.prepare('SELECT count(*) AS n FROM node_sync_versions').get()).toEqual({ n: 1 });
});

it('replays creation after retirement without loading payloads, renewing or changing published state', async () => {
  const host = textDevice();
  hosts.push(host);
  await host.receive([textBranch('base', 'Main')]);
  const record = candidate('choice', new Date().toISOString());
  await writeTopicAlternative(host.db, record, true);
  await settleTopicAlternatives(host.db, 'topic', record.body_blob_hash, record.updated_at);
  const state = () => host.sqlite.prepare("SELECT state_seq, content_hash FROM sync_object_state WHERE object_id = 'choice'").get();
  const before = state();
  const observed = observeReads(host.db);
  for (let index = 0; index < 2; index++) await applyTopicAlternativeRecord(observed.port, {
    object_type: 'node_text_alternative', object_id: record.alternative_id,
    content_hash: topicAlternativeHash(record), payload_json: JSON.stringify(record),
    updated_at: record.updated_at, deleted_at: null
  });
  expect(await host.alternatives()).toEqual([]);
  expect(observed.bodyBytes()).toBe(0);
  expect(state()).toEqual(before);
});
