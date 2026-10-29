import type { readDailyFlowTable } from './dailyFlowTableRead.js';
import type { DbPort } from './dbPort.js';
import { isStoredAncestorVersion } from './syncNodeGraph.js';

export async function assertDailyFlowTableDependencies(db: DbPort, table: Awaited<ReturnType<typeof readDailyFlowTable>>) {
  const needed = new Set(table.session ? table.members.map(row => row.node_id) : []);
  const identities = new Set<string>();
  const described = new Set<string>();
  for (const dependency of table.dependencies) {
    if (!needed.has(dependency.nodeId)) throw new Error('daily_flow_dependency_unrequested');
    const identity = JSON.stringify([dependency.nodeId, dependency.reviewFactId]);
    if (identities.has(identity)) throw new Error('daily_flow_dependency_duplicate');
    identities.add(identity);
    described.add(dependency.nodeId);
    const [node] = await db.query<{ current_version_id: string | null }>('SELECT current_version_id FROM nodes WHERE id=?', [dependency.nodeId]);
    if (!node) throw new Error(`framed_sync_review_node_missing:${dependency.nodeId}`);
    if (dependency.versionId && node.current_version_id !== dependency.versionId &&
        (!node.current_version_id || !await isStoredAncestorVersion(db, dependency.versionId, node.current_version_id))) {
      throw new Error(`framed_sync_review_node_missing:${dependency.nodeId}`);
    }
    if (dependency.reviewFactId && !(await db.query('SELECT 1 FROM review_log WHERE node_id=? AND op_id=?',
      [dependency.nodeId, dependency.reviewFactId])).length) {
      throw new Error(`framed_sync_review_node_missing:${dependency.nodeId}`);
    }
    if (dependency.readingHash) {
      const [state] = await db.query<{ content_hash: string; updated_at: string; last_handled_at: string | null; repetition_count: number | null }>(
        "SELECT s.content_hash,s.updated_at,r.last_handled_at,r.repetition_count FROM sync_object_state s LEFT JOIN node_reading r ON r.node_id=s.object_id WHERE s.object_type='node_reading' AND s.object_id=?", [dependency.nodeId]);
      const localReading = state ? `${state.last_handled_at ?? ''}\n${String(state.repetition_count ?? 0).padStart(12, '0')}` : '';
      const sourceReading = `${dependency.readingLastHandledAt}\n${String(dependency.readingRepetitionCount).padStart(12, '0')}`;
      if (!state || (state.content_hash !== dependency.readingHash && localReading <= sourceReading &&
          `${state.updated_at}\n${state.content_hash}` < `${dependency.readingUpdatedAt}\n${dependency.readingHash}`)) {
        throw new Error(`framed_sync_review_node_missing:${dependency.nodeId}`);
      }
    }
  }
  if ([...needed].some(id => !described.has(id))) throw new Error('daily_flow_dependencies_incomplete');
}
