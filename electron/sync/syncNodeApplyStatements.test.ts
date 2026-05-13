import { expect, it } from 'vitest';

import {
  buildAttachmentExistsQuery,
  buildNodeAttachmentDelete,
  buildNodeAttachmentInsert,
  buildNodeOrderReplace,
  buildRemoteNodeUpsert,
  buildRemoteNodeVersionUpsert
} from '../../lib/core/sync/syncNodeApplyStatements.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

function createNodeRecord(overrides: Partial<NativeSyncNodeRecord> = {}): NativeSyncNodeRecord {
  return {
    ancestor_version_ids: ['desktop#0'],
    content_hash: 'hash-1',
    device_id: 'phone',
    object_id: 'node-1',
    object_type: 'node',
    parent_version_id: 'desktop#0',
    snapshot: {
      anchor_link: null,
      attachments: [],
      content: 'remote body',
      created_at: '2026-04-21T10:00:00.000Z',
      deleted_at: null,
      desired_retention: 0.8,
      hide_title_heading: true,
      id: 'node-1',
      image_regions: null,
      is_title_manual: true,
      kind: 'item',
      opening_text: 'remote opening',
      parent_id: null,
      position: 4,
      priority: 2,
      reveal: 'answer',
      title: 'Remote Node',
      updated_at: '2026-04-21T11:00:00.000Z',
      virtual_filter: null
    },
    updated_at: '2026-04-21T11:00:00.000Z',
    version_created_at: '2026-04-21T11:00:00.000Z',
    version_id: 'phone#1',
    ...overrides
  };
}

it('builds the canonical remote node upsert params', () => {
  const statement = buildRemoteNodeUpsert(createNodeRecord(), 'body-hash');

  expect(statement.sql).toContain('INSERT INTO nodes');
  expect(statement.params).toEqual([
    'node-1',
    null,
    'item',
    2,
    0.8,
    'Remote Node',
    1,
    1,
    'remote body',
    'body-hash',
    'remote opening',
    null,
    'answer',
    null,
    null,
    null,
    'phone#1',
    'phone',
    '2026-04-21T10:00:00.000Z',
    '2026-04-21T11:00:00.000Z',
    null
  ]);
});

it('builds remote version upsert only for complete version metadata', () => {
  expect(buildRemoteNodeVersionUpsert(createNodeRecord())?.params).toEqual([
    'phone#1',
    'node-1',
    'desktop#0',
    'phone',
    '2026-04-21T11:00:00.000Z',
    'hash-1',
    expect.stringContaining('"title":"Remote Node"')
  ]);
  expect(buildRemoteNodeVersionUpsert(createNodeRecord({ version_id: null }))).toBeNull();
});

it('builds node order replace as upsert or delete', () => {
  expect(buildNodeOrderReplace(createNodeRecord())).toMatchObject({
    params: ['node-1'],
    sql: 'DELETE FROM node_order WHERE node_id = ?'
  });
  expect(buildNodeOrderReplace(createNodeRecord({
    snapshot: {
      ...createNodeRecord().snapshot,
      kind: 'folder'
    }
  })).params).toEqual(['node-1', 4]);
  expect(buildNodeOrderReplace(createNodeRecord({
    snapshot: {
      ...createNodeRecord().snapshot,
      kind: 'folder',
      position: null
    }
  }))).toMatchObject({
    params: ['node-1'],
    sql: 'DELETE FROM node_order WHERE node_id = ?'
  });
});

it('builds node attachment link statements without deciding existence', () => {
  const record = createNodeRecord({
    snapshot: {
      ...createNodeRecord().snapshot,
      attachments: [{ attachment_id: 'att-1', role: 'reference' }]
    }
  });

  expect(buildNodeAttachmentDelete(record)).toMatchObject({
    params: ['node-1']
  });
  expect(buildAttachmentExistsQuery('att-1')).toMatchObject({
    params: ['att-1']
  });
  const [attachment] = record.snapshot.attachments;
  expect(attachment).toBeDefined();
  expect(buildNodeAttachmentInsert(record, attachment!)).toMatchObject({
    params: ['node-1', 'att-1', 'reference']
  });
});
