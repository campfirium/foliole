import { expect, it, vi } from 'vitest';

import type { DbPort, DbRow } from '../../../../../../lib/core/sync/dbPort.js';
import { decodeAndValidateProtocolMessage } from '../../../../../../lib/core/sync/framedSyncProtocolCodec.js';

import { prepareCompanionFramedSyncOutbound } from './companionFramedSyncOutbound.js';

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

it('freezes a current node fact and durable hold before returning native wire input', async () => {
  const run = vi.fn(async () => ({ changes: 1, lastInsertRowId: null }));
  const port = {
    query: vi.fn(async (sql: string): Promise<DbRow[]> => {
      if (sql.includes('JOIN node_sync_versions')) return [{
        body_text: 'Outbound body', content_hash: '44'.repeat(32), created_at: time,
        host_name: 'sender', object_id: 'node-1', parent_version_id: null,
        snapshot_json: JSON.stringify(snapshot), version_id: 'version-1'
      }];
      return [];
    }),
    run,
    transaction: async <T>(task: (tx: DbPort) => Promise<T>) => task(port as DbPort)
  } as DbPort;
  const result = await prepareCompanionFramedSyncOutbound(port, {
    group_id: 'group-1', object_id: 'node-1', receiver_device_id: 'receiver',
    receiver_library_epoch: 'receiver-epoch', sender_device_id: 'sender',
    sender_library_epoch: 'sender-epoch'
  });
  expect(result.publication_state).toBe('created');
  expect(result.blob.data_text).toBe('Outbound body');
  expect(decodeAndValidateProtocolMessage(Uint8Array.from(result.fact_message_bytes), 3).payloadCase)
    .toBe('fact');
  expect(run).toHaveBeenCalledWith('INSERT INTO framed_sync_outbound_holds VALUES (?, ?)', [
    expect.any(Uint8Array), 'receiver'
  ]);
});
