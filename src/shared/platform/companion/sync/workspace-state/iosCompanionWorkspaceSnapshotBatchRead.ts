import type { DbPort, DbRow } from '../../../../../../lib/core/sync/dbPort';

// Bounds rows per bridge response, not bytes for arbitrarily large individual bodies.
const BODY_BATCH_ROWS = 500;

/** The caller owns one transaction spanning the IDs, body batches and other snapshot reads. */
export async function loadOrderedWorkspaceSnapshotRows(db: DbPort, sql: string, hostName: string) {
  const ordered = await db.query<{ id: string }>(`SELECT id FROM (${sql})`, [hostName]);
  const rowsById = new Map<string, DbRow>();
  for (let start = 0; start < ordered.length; start += BODY_BATCH_ROWS) {
    const ids = ordered.slice(start, start + BODY_BATCH_ROWS).map(row => row.id);
    const rows = await db.query(
      `SELECT * FROM (${sql}) WHERE id IN (${ids.map(() => '?').join(', ')})`,
      [hostName, ...ids]
    );
    for (const row of rows) rowsById.set(String(row.id), row);
  }
  return ordered.map(({ id }) => {
    const row = rowsById.get(id);
    if (!row) throw new Error('Workspace snapshot changed within its read transaction.');
    return row;
  });
}
