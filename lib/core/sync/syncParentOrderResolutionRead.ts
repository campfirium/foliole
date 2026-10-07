import type { DbPort, DbRow } from './dbPort.js';
import { parseManagedParentOrderFact, parseParentOrderFact } from './syncParentOrderFact.js';
import type { ParentOrderLineage } from './syncParentOrderGraph.js';
import { planParentOrderResolution } from './syncParentOrderResolutionPlan.js';
import type { ParentOrderVersion } from './syncParentOrderVersionGraph.js';

/** Validate every historical snapshot before the original head, member and lineage checks. */
export async function readParentOrderResolutionHistory(db: DbPort, parentId: string, headIds: readonly string[]) {
  const rows = await db.query<{ version_id: string }>(
    'SELECT version_id FROM parent_order_versions WHERE parent_id = ?', [parentId]);
  const lineage: ParentOrderLineage[] = [];
  const versions = new Map<string, ParentOrderVersion>();
  for (const row of rows) {
    const [stored] = await db.query<DbRow>('SELECT * FROM parent_order_versions WHERE version_id = ?', [row.version_id]);
    if (!stored) throw new Error('sync_parent_order_lineage_unproven');
    const version = parseManagedParentOrderFact(stored).version;
    lineage.push({ versionId: version.versionId, kind: version.kind, parentVersionIds: version.parentVersionIds });
    if (headIds.includes(version.versionId)) {
      if (version.order === null) throw new Error(`sync_parent_order_body_unavailable:${version.versionId}`);
      versions.set(version.versionId, parseParentOrderFact(stored).version);
    }
  }
  return { lineage, versions };
}

/** Load real orders only after the common-base and original-edit plan is known. */
export async function readParentOrderResolutionSnapshots(db: DbPort,
  history: Awaited<ReturnType<typeof readParentOrderResolutionHistory>>, headIds: readonly string[]) {
  const plan = planParentOrderResolution(history.lineage, headIds);
  const versions = history.versions;
  for (const id of plan.requiredVersionIds) {
    if (!versions.has(id)) versions.set(id, await readSnapshot(db, id));
  }
  return { plan, versions };
}

async function readSnapshot(db: DbPort, id: string) {
  const [row] = await db.query<DbRow>('SELECT * FROM parent_order_versions WHERE version_id = ?', [id]);
  if (!row) throw new Error('sync_parent_order_lineage_unproven');
  if (row.child_ids_json === 'null') throw new Error(`sync_parent_order_body_unavailable:${id}`);
  return parseParentOrderFact(row).version;
}
