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
  expect(buildSyncPackNodeUpsertSql({ incomingAlias: 'incoming' })).toContain(
    'FROM incoming.nodes incoming'
  );
  expect(buildSyncPackNodeUpsertSql({ incomingAlias: 'incoming' })).toContain(
    "incoming.object_type = 'node'"
  );
  expect(buildSyncPackNodeUpsertSql({ incomingAlias: 'incoming', incomingHasCurrentVersionId: false })).toContain(
    'SELECT existing.current_version_id FROM main.nodes existing WHERE existing.id = incoming.id'
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
    "INNER JOIN main.nodes node ON node.id = incoming.node_id AND node.kind = 'folder'"
  );
});
