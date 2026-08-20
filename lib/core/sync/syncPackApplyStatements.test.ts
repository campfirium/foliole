import { describe, expect, it } from 'vitest';

import { buildSyncPackApplyableRowsSql } from './syncPackApplyStatements.js';

describe('buildSyncPackApplyableRowsSql', () => {
  it('lets nodes and learning facts reconcile while keeping dirty guards for other content-backed state', () => {
    const sql = buildSyncPackApplyableRowsSql({ sourcePeerId: 'desktop-peer' });

    expect(sql).toContain("incoming.object_type IN ('node', 'node_reading', 'node_review', 'view_state')");
    expect(sql).toContain("current.content_hash < incoming.content_hash");
    expect(sql).toContain('SELECT 1 FROM main.sync_delivery_receipts receipt');
    expect(sql).toContain("receipt.authorization_id = 'desktop-peer'");
  });
});
