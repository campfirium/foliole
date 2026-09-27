import type { DbPort, DbRow } from './dbPort.js';

interface ParentRow extends DbRow {
  legacy_parent_version_id: string | null;
  parent_version_id: string | null;
  version_id: string;
}

export async function loadSyncPackVersionAncestry(port: DbPort) {
  const rows = await port.query<ParentRow>(
    `SELECT version.version_id, version.parent_version_id AS legacy_parent_version_id,
       parent.parent_version_id
     FROM node_sync_versions version
     LEFT JOIN node_sync_version_parents parent ON parent.version_id = version.version_id
     ORDER BY version.version_id, parent.ordinal`
  );
  const parents = new Map<string, string[]>();
  for (const row of rows) {
    const existing = parents.get(row.version_id) ?? [];
    if (row.parent_version_id) existing.push(row.parent_version_id);
    else if (row.legacy_parent_version_id) existing.push(row.legacy_parent_version_id);
    parents.set(row.version_id, existing);
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
