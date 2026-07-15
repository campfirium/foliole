import { expect, it } from 'vitest';

import {
  buildSyncPackApplyableRowsSql,
  buildSyncPackContentBlobUpsertSql,
  buildSyncPackExternalDocumentUpsertSql,
  buildSyncPackNodeAttachmentDeleteSql,
  buildSyncPackNodeAttachmentInsertSql,
  buildSyncPackNodeOrderDeleteSql,
  buildSyncPackNodeOrderUpsertSql,
  buildSyncPackNodeUpsertSql
} from '../../lib/core/sync/syncPackApplyStatements.js';
import { SYNC_PACK_NODE_COLUMNS } from '../../lib/core/sync/syncPackNodeFields.js';

it('builds the applyable row filter used by sync pack apply', () => {
  expect(buildSyncPackApplyableRowsSql({ objectType: 'node' })).toContain(
    "FROM inc.sync_object_state incoming LEFT JOIN main.sync_object_state current"
  );
  expect(buildSyncPackApplyableRowsSql({ objectType: 'node' })).toContain(
    "current.sync_dirty <> 1 OR EXISTS"
  );
  expect(buildSyncPackApplyableRowsSql({ objectType: 'node' })).toContain(
    "AND incoming.object_type = 'node'"
  );
  expect(buildSyncPackApplyableRowsSql({ objectType: 'node' })).toContain(
    "incoming.deleted_at IS NOT NULL OR EXISTS"
  );
});

it('builds external document pack apply statement', () => {
  const sql = buildSyncPackExternalDocumentUpsertSql({ incomingAlias: 'incoming' });

  expect(sql).toContain('INSERT OR REPLACE INTO main.external_documents');
  expect(sql).toContain('FROM incoming.external_documents');
  expect(sql).toContain("incoming.object_type = 'external_document'");
});

it('builds content blob metadata upsert for referenced body blobs', () => {
  const sql = buildSyncPackContentBlobUpsertSql({ incomingAlias: 'incoming' });

  expect(sql).toContain('INSERT OR REPLACE INTO main.content_blobs');
  expect(sql).toContain('FROM incoming.content_blobs incoming');
  expect(sql).toContain('SELECT body_blob_hash FROM incoming.nodes');
  expect(sql).toContain("incoming.object_type = 'node'");
  expect(sql).toContain('UNION SELECT body_blob_hash FROM incoming.external_documents');
});

it('builds node and attachment pack apply statements against an incoming alias', () => {
  const nodeSql = buildSyncPackNodeUpsertSql({ incomingAlias: 'incoming' });

  expect(nodeSql).not.toContain('INSERT OR REPLACE INTO main.nodes');
  expect(nodeSql).toContain('INSERT INTO main.nodes');
  expect(nodeSql).toContain('WHERE true ORDER BY sorted.depth ASC');
  expect(nodeSql).toContain('ON CONFLICT(id) DO UPDATE SET');
  expect(nodeSql).toContain('title = excluded.title');
  expect(nodeSql).toContain('reveal = excluded.reveal');
  expect(nodeSql).toContain('priority = excluded.priority');
  expect(nodeSql).toContain('manual_child_order = excluded.manual_child_order');
  expect(nodeSql).toContain('CASE WHEN incoming.import_source_fingerprint IS NULL');
  expect(nodeSql).not.toContain('position = excluded.position');
  expect(buildSyncPackNodeUpsertSql({ incomingAlias: 'incoming' })).toContain(
    'FROM incoming.nodes incoming'
  );
  expect(buildSyncPackNodeUpsertSql({ incomingAlias: 'incoming' })).toContain(
    "incoming.object_type = 'node'"
  );
  const legacySql = buildSyncPackNodeUpsertSql({
    incomingAlias: 'incoming',
    incomingNodeColumns: SYNC_PACK_NODE_COLUMNS.filter((column) => ![
      'current_version_id', 'import_content_fingerprint', 'import_source_fingerprint',
      'manual_child_order', 'priority', 'reveal'
    ].includes(column))
  });
  expect(legacySql).toContain(
    'SELECT existing.current_version_id FROM main.nodes existing WHERE existing.id = incoming.id'
  );
  expect(legacySql).toContain(
    'SELECT existing.reveal FROM main.nodes existing WHERE existing.id = incoming.id'
  );
  expect(legacySql).toContain(
    'SELECT existing.manual_child_order FROM main.nodes existing WHERE existing.id = incoming.id'
  );
  expect(legacySql).toContain(
    'SELECT existing.priority FROM main.nodes existing WHERE existing.id = incoming.id'
  );
  expect(legacySql).toContain(
    'SELECT existing.import_source_fingerprint FROM main.nodes existing WHERE existing.id = incoming.id'
  );
  expect(legacySql).toContain(
    'SELECT existing.import_content_fingerprint FROM main.nodes existing WHERE existing.id = incoming.id'
  );
  expect(buildSyncPackNodeAttachmentDeleteSql({ incomingAlias: 'incoming' })).toContain(
    'DELETE FROM main.node_attachments WHERE node_id IN'
  );
  expect(buildSyncPackNodeAttachmentInsertSql({ incomingAlias: 'incoming' })).toContain(
    'INNER JOIN main.attachments attachment ON attachment.id = incoming.attachment_id'
  );
  expect(buildSyncPackNodeOrderDeleteSql({ incomingAlias: 'incoming' })).toContain(
    'DELETE FROM main.node_order WHERE node_id IN'
  );
  expect(buildSyncPackNodeOrderUpsertSql({ incomingAlias: 'incoming' })).toContain(
    'FROM incoming.node_order incoming'
  );
  expect(buildSyncPackNodeOrderUpsertSql({ incomingAlias: 'incoming' })).toContain(
    'INNER JOIN main.nodes node ON node.id = incoming.node_id'
  );
  expect(buildSyncPackNodeOrderUpsertSql({ incomingAlias: 'incoming' })).not.toContain('node.kind');
});
