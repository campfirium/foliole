import { parentOrderId } from '../database/parentChildOrder.js';

import type { DbPort, DbRow } from './dbPort.js';

/** Missing members require deletion evidence; moved members belong to their actual parent. */
export async function loadParentOrderMembers(port: DbPort, parentId: string,
  ids: readonly string[], incomingAlias: string) {
  const rows = await port.query<{ id: string; title: string; parent_id: string | null;
    deleted_at: string | null } & DbRow>(
    `SELECT id, title, parent_id, deleted_at FROM nodes
      WHERE id IN (SELECT value FROM json_each(?))`, [JSON.stringify(ids)]);
  const found = new Set(rows.map((row) => row.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) {
    const retired = await port.query<{ object_id: string }>(`SELECT object_id FROM sync_object_state
      WHERE object_type = 'node' AND deleted_at IS NOT NULL
        AND object_id IN (SELECT value FROM json_each(?))
      UNION SELECT object_id FROM ${incomingAlias}.sync_object_state
      WHERE object_type = 'node' AND deleted_at IS NOT NULL
        AND object_id IN (SELECT value FROM json_each(?))`,
    [JSON.stringify(missing), JSON.stringify(missing)]);
    const retiredIds = new Set(retired.map((row) => row.object_id));
    const missingMember = missing.find((id) => !retiredIds.has(id));
    if (missingMember) {
      throw new Error(`sync_parent_order_member_missing:${missingMember}`);
    }
  }
  const names = new Map(rows.filter((row) => !row.deleted_at &&
    parentOrderId(row.parent_id) === parentId).map((row) => [row.id, row.title]));
  return { members: new Set(names.keys()), compareAdded: (a: string, b: string) =>
    (names.get(a) ?? '').localeCompare(names.get(b) ?? '', 'zh-CN', { numeric: true }) ||
      (a < b ? -1 : a > b ? 1 : 0) };
}
