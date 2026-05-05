// @vitest-environment node

import { expect, it } from 'vitest';

import {
  buildSyncPackManifest,
  isSyncPackObjectType,
  isSyncPackPayloadObjectType,
  isSyncPackStateObjectType,
  SYNC_PACK_OBJECT_TYPE_TABLES,
  SYNC_PACK_OBJECT_TYPES,
  SYNC_PACK_PAYLOAD_OBJECT_TYPES,
  SYNC_PACK_TABLE_NAMES
} from './syncPackManifest.js';

it('builds the pack manifest from the shared table map', () => {
  expect(SYNC_PACK_TABLE_NAMES).toEqual([
    'sync_object_state',
    'sync_objects',
    'nodes',
    'node_attachments',
    'external_documents',
    'content_blobs',
    'review_log'
  ]);
  expect(SYNC_PACK_OBJECT_TYPE_TABLES).toEqual({
    external_document: 'external_documents',
    node: 'nodes'
  });
  expect([...SYNC_PACK_OBJECT_TYPES]).toEqual(['external_document', 'node']);
  expect(isSyncPackObjectType('node')).toBe(true);
  expect(isSyncPackObjectType('setting')).toBe(false);

  expect(buildSyncPackManifest({
    fromStateSeq: 1,
    packId: 'pack-1',
    tableRows: {
      content_blobs: [{}],
      external_documents: [],
      node_attachments: [{}],
      nodes: [{}, {}],
      review_log: [{}],
      sync_object_state: [{}, {}, {}],
      sync_objects: [{}]
    },
    toStateSeq: 4
  })).toEqual({
    from_state_seq: 1,
    pack_id: 'pack-1',
    tables: [
      { name: 'sync_object_state', row_count: 3 },
      { name: 'sync_objects', row_count: 1 },
      { name: 'nodes', row_count: 2 },
      { name: 'node_attachments', row_count: 1 },
      { name: 'external_documents', row_count: 0 },
      { name: 'content_blobs', row_count: 1 },
      { name: 'review_log', row_count: 1 }
    ],
    to_state_seq: 4
  });
});

it('declares the stage one payload object inventory explicitly', () => {
  expect([...SYNC_PACK_PAYLOAD_OBJECT_TYPES]).toEqual([
    'attachment',
    'external_folder',
    'import_source',
    'node_reading',
    'node_review',
    'pdf_page_text',
    'setting',
    'view_state'
  ]);
  expect(isSyncPackPayloadObjectType('node_review')).toBe(true);
  expect(isSyncPackPayloadObjectType('node_attachments')).toBe(false);
  expect(isSyncPackStateObjectType('node')).toBe(true);
  expect(isSyncPackStateObjectType('view_state')).toBe(true);
  expect(isSyncPackStateObjectType('import_run')).toBe(false);
});
