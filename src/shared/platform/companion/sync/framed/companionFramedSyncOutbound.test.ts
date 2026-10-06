import { expect, it, vi } from 'vitest';

import type { DbPort, DbRow } from '../../../../../../lib/core/sync/dbPort.js';
import { decodeAndValidateProtocolMessage } from '../../../../../../lib/core/sync/framedSyncProtocolCodec.js';
import { canonicalFactFromValidatedMessage } from '../../../../../../lib/core/sync/framedSyncWireFact.js';

import {
  inspectCompanionFramedSyncOutbound,
  prepareCompanionFramedSyncOutbound
} from './companionFramedSyncOutbound.js';

const time = '2026-10-05T01:00:00.000Z';
const snapshot = {
  anchor_link: null, anchor_resolution_status: null, anchor_source_version_id: null,
  attachments: [], body_blob_hash: null, content: 'Outbound body', created_at: time,
  deleted_at: null, desired_retention: null, enable_short_term: false,
  hide_title_heading: false, id: 'node-1', image_regions: null, image_sources: null,
  import_content_fingerprint: null, import_source_fingerprint: null, is_title_manual: true,
  kind: 'topic', manual_child_order: null, opening_text: null, parent_id: null,
  position: 0, priority: 0, resource_references: null, reveal: null,
  sequential_reading_enabled: false, shelved_at: null, title: 'Node', updated_at: time,
  virtual_filter: null
};

function versionRow(versionId: string, bodyText = 'Outbound body', parentVersionId: string | null = null) {
  return {
    body_text: bodyText, content_hash: '44'.repeat(32), created_at: time,
    host_name: 'sender', object_id: 'node-1', parent_version_id: parentVersionId,
    snapshot_json: JSON.stringify({ ...snapshot, body_blob_hash: null, content: bodyText }),
    version_id: versionId
  };
}

it('freezes a current node fact and durable hold before returning native wire input', async () => {
  const run = vi.fn(async () => ({ changes: 1, lastInsertRowId: null }));
  const port = {
    query: vi.fn(async (sql: string): Promise<DbRow[]> => {
      if (sql.includes('SELECT node.id')) return [{
        body_text: 'Outbound body', content_hash: '44'.repeat(32),
        current_version_id: 'version-1', id: 'node-1'
      }];
      if (sql.includes('FROM node_sync_versions WHERE version_id IN')) {
        return [versionRow('version-1')];
      }
      return [];
    }),
    run,
    transaction: async <T>(task: (tx: DbPort) => Promise<T>) => task(port as DbPort)
  } as DbPort;
  const result = await prepareCompanionFramedSyncOutbound(port, {
    group_id: 'group-1', include_current_node: true, object_id: 'node-1',
    receiver_device_id: 'receiver', required_relation_ids: [], review_fact_ids: [], state_fact_ids: [],
    receiver_library_epoch: 'receiver-epoch', sender_device_id: 'sender',
    sender_library_epoch: 'sender-epoch'
  });
  expect(result.publication_state).toBe('created');
  expect(result.blobs[0]?.data_text).toBe('Outbound body');
  expect(decodeAndValidateProtocolMessage(Uint8Array.from(result.fact_message_bytes_list[0]!), 3).payloadCase)
    .toBe('fact');
  expect(run).toHaveBeenCalledWith('INSERT INTO framed_sync_outbound_holds VALUES (?, ?)', [
    expect.any(Uint8Array), 'receiver'
  ]);
});

it('prepares the exact version chain with its parent and review facts', async () => {
  const relationId = JSON.stringify(['version-1', 'parent-1', 0]);
  const review = { difficulty_after: 3.75, difficulty_before: 2.25,
    due_after: '2026-10-08T01:00:00Z', due_before: '2026-10-06T01:00:00Z', grade: 3,
    host_name: 'sender', id: 'review-row-1', node_id: 'node-1', op_id: 'review-1',
    reviewed_at: time, scheduler_version: 'fsrs-6', stability_after: 4.5, stability_before: 2.5 };
  const parent = { object_id: 'node-1', ordinal: 0,
    parent_version_id: 'parent-1', version_id: 'version-1' };
  const port = {
    query: vi.fn(async (sql: string): Promise<DbRow[]> => {
      if (sql.includes('SELECT node.id')) return [{ body_text: 'body',
        content_hash: '44'.repeat(32), current_version_id: 'version-1', id: 'node-1' }];
      if (sql.includes('FROM node_sync_versions WHERE version_id IN')) return [
        versionRow('parent-1', 'Parent body'), versionRow('version-1', 'Child body', 'parent-1')
      ];
      if (sql.includes('SELECT version_id, parent_version_id')) return [parent];
      if (sql.includes('parent.ordinal = ?')) return [parent];
      if (sql.includes('FROM node_sync_version_parents parent')) return [{ ...parent, node_id: 'node-1' }];
      if (sql.includes('FROM review_log WHERE node_id = ? AND op_id = ?')) return [review];
      if (sql.includes('FROM review_log')) return [{ node_id: 'node-1', op_id: 'review-1' }];
      return [];
    }),
    run: vi.fn(async () => ({ changes: 1, lastInsertRowId: null })),
    transaction: async <T>(task: (tx: DbPort) => Promise<T>) => task(port as DbPort)
  } as DbPort;
  const result = await prepareCompanionFramedSyncOutbound(port, {
    group_id: 'group-1', include_current_node: false, object_id: 'node-1',
    receiver_device_id: 'receiver', receiver_library_epoch: 'receiver-epoch',
    required_relation_ids: [relationId], review_fact_ids: ['review-1'], state_fact_ids: [],
    sender_device_id: 'sender', sender_library_epoch: 'sender-epoch'
  });
  expect(result.blobs.map((blob) => blob.data_text)).toEqual(['Parent body', 'Child body']);
  expect(result.fact_message_bytes_list.map((bytes) =>
    decodeAndValidateProtocolMessage(Uint8Array.from(bytes), 3).payloadCase))
    .toEqual(['fact', 'fact', 'fact', 'fact']);
});

it('inspects and freezes canonical resource files without returning data_text', async () => {
  const hash = 'ab'.repeat(32);
  const storageKey = `${hash}.pdf`;
  const resourceReferences = JSON.stringify([
    { original_name: 'Paper.pdf', role: 'reference', storage_key: storageKey }
  ]);
  const port = {
    query: vi.fn(async (sql: string): Promise<DbRow[]> => {
      if (sql.includes('SELECT * FROM (')) return [{
        body_text: 'Outbound body', content_hash: '44'.repeat(32), current_version_id: 'version-1',
        id: 'node-1', is_tombstone: 0, resource_references: resourceReferences
      }];
      if (sql.includes('FROM node_sync_versions WHERE version_id IN')) return [{
        ...versionRow('version-1'),
        snapshot_json: JSON.stringify({ ...snapshot, resource_references: resourceReferences })
      }];
      return [];
    }),
    run: vi.fn(async () => ({ changes: 1, lastInsertRowId: null })),
    transaction: async <T>(task: (tx: DbPort) => Promise<T>) => task(port as DbPort)
  } as DbPort;
  const payload = {
    group_id: 'group-1', include_current_node: true, object_id: 'node-1',
    receiver_device_id: 'receiver', required_relation_ids: [], review_fact_ids: [], state_fact_ids: [],
    receiver_library_epoch: 'receiver-epoch', sender_device_id: 'sender',
    sender_library_epoch: 'sender-epoch'
  };

  await expect(inspectCompanionFramedSyncOutbound(port, payload)).resolves.toEqual({
    resource_storage_keys: [storageKey]
  });
  const result = await prepareCompanionFramedSyncOutbound(port, {
    ...payload, resource_files: [{ byte_length: '17', storage_key: storageKey }]
  });

  expect(result.blobs).toContainEqual({
    byte_length: '17', required: true, role: 3, sha256: hash, storage_key: storageKey
  });
  expect(result.blobs.find((blob) => blob.storage_key === storageKey)).not.toHaveProperty('data_text');
  const fact = canonicalFactFromValidatedMessage(decodeAndValidateProtocolMessage(
    Uint8Array.from(result.fact_message_bytes_list[0]!), 3));
  expect(fact.blobs.map((blob) => blob.role)).toEqual([1, 3]);
});
