import type { DbPort, DbRow } from './dbPort.js';

interface ParentRow extends DbRow {
  legacy_parent_version_id: string | null;
  parent_version_id: string | null;
  version_id: string;
  ordinal: number;
}

const VERSION_BATCH_SIZE = 64;
const RELATION_PAGE_SIZE = 128;

export async function loadSyncPackVersionAncestry(port: DbPort, versionIds: string[]) {
  const parents = new Map<string, string[]>();
  const discovered = new Set(versionIds);
  const pending = [...discovered];
  let offset = 0;
  while (offset < pending.length) {
    const batch = pending.slice(offset, offset + VERSION_BATCH_SIZE);
    offset += batch.length;
    for await (const row of readParentRows(port, batch)) {
      const entries = parents.get(row.version_id) ?? [];
      const parent = row.parent_version_id ?? row.legacy_parent_version_id;
      if (parent) {
        entries.push(parent);
        if (!discovered.has(parent)) {
          discovered.add(parent);
          pending.push(parent);
        }
      }
      parents.set(row.version_id, entries);
    }
  }
  return {
    ancestorIds(versionId: string) {
      const visited = new Set<string>([versionId]);
      const pending = [versionId];
      for (let index = 0; index < pending.length; index++) {
        for (const parent of parents.get(pending[index]!) ?? []) {
          if (visited.has(parent)) continue;
          visited.add(parent);
          pending.push(parent);
        }
      }
      visited.delete(versionId);
      return [...visited];
    }
  };
}

async function* readParentRows(port: DbPort, versionIds: string[]) {
  let afterVersion: string | null = null;
  let afterOrdinal = -1;
  while (true) {
    const rows: ParentRow[] = await port.query<ParentRow>(
      `SELECT version.version_id, version.parent_version_id AS legacy_parent_version_id,
         parent.parent_version_id, coalesce(parent.ordinal, -1) AS ordinal
       FROM node_sync_versions version
       LEFT JOIN node_sync_version_parents parent ON parent.version_id = version.version_id
       WHERE version.version_id IN (SELECT value FROM json_each(?))
         AND (? IS NULL OR version.version_id > ? OR
           (version.version_id = ? AND coalesce(parent.ordinal, -1) > ?))
       ORDER BY version.version_id, coalesce(parent.ordinal, -1) LIMIT ?`,
      [JSON.stringify(versionIds), afterVersion, afterVersion, afterVersion,
        afterOrdinal, RELATION_PAGE_SIZE]
    );
    yield* rows;
    if (rows.length < RELATION_PAGE_SIZE) return;
    const last = rows.at(-1)!;
    afterVersion = last.version_id;
    afterOrdinal = last.ordinal;
  }
}
