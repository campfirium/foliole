import { describe, expect, it } from 'vitest';

import { buildSyncPackApplyableRowsSql } from './syncPackApplyStatements.js';

describe('buildSyncPackApplyableRowsSql', () => {
  it('lets view_state follow LWW while keeping dirty guards for content-backed state', () => {
    const sql = buildSyncPackApplyableRowsSql({ sourcePeerId: 'desktop-peer' });

    expect(sql).toContain("incoming.object_type IN ('node', 'view_state') OR current.sync_dirty <> 1");
    expect(sql).toContain('SELECT 1 FROM main.sync_delivery_receipts receipt');
    expect(sql).toContain("receipt.peer_id = 'desktop-peer'");
  });
});
