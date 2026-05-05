import { expect, it } from 'vitest';

import {
  buildSyncPackApplyableRowsSql,
  buildSyncPackNodeAttachmentDeleteSql,
  buildSyncPackNodeAttachmentInsertSql,
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
});

it('builds node and attachment pack apply statements against an incoming alias', () => {
  expect(buildSyncPackNodeUpsertSql({ incomingAlias: 'incoming' })).toContain(
    'FROM incoming.nodes WHERE id IN'
  );
  expect(buildSyncPackNodeUpsertSql({ incomingAlias: 'incoming', incomingHasCurrentVersionId: false })).toContain(
    'SELECT existing.current_version_id FROM main.nodes existing WHERE existing.id = incoming.nodes.id'
  );
  expect(buildSyncPackNodeAttachmentDeleteSql({ incomingAlias: 'incoming' })).toContain(
    'DELETE FROM main.node_attachments WHERE node_id IN'
  );
  expect(buildSyncPackNodeAttachmentInsertSql({ incomingAlias: 'incoming' })).toContain(
    'SELECT node_id, attachment_id, role FROM incoming.node_attachments'
  );
});
