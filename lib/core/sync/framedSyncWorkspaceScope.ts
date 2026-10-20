import { NODE_CHILD_STATE_TYPES, nodeChildOwnerSql } from '../database/nodeChildStateSql.js';
import { ROOT_CHILD_ORDER_ID } from '../database/parentChildOrder.js';
import type { WorkspaceRefreshScope } from '../database/workspaceSnapshotRefresh.js';

import type { DbPort } from './dbPort.js';
import type { CanonicalFact } from './framedSyncCanonicalManifest.js';
import { restoreFramedSyncNodeChildFact } from './framedSyncNodeChildFact.js';
import { restoreFramedSyncObjectStateFact } from './framedSyncObjectStateFact.js';

export async function appliedStateWorkspaceScope(db: DbPort, fact: CanonicalFact): Promise<WorkspaceRefreshScope> {
  const record = fact.objectType === 'node' ? restoreFramedSyncNodeChildFact(fact)
    : restoreFramedSyncObjectStateFact(fact);
  if (record.object_type === 'parent_child_order') {
    return { kind: 'nodes', nodeIds: record.object_id === ROOT_CHILD_ORDER_ID ? [] : [record.object_id], structure: true };
  }
  if (fact.objectType === 'node') return { kind: 'nodes', nodeIds: [fact.globalId] };
  if (NODE_CHILD_STATE_TYPES.some(type => type === record.object_type)) {
    const [owner] = await db.query<{ node_id: string | null }>(`SELECT ${nodeChildOwnerSql('state')} AS node_id
      FROM sync_object_state state WHERE object_type = ? AND object_id = ?`, [record.object_type, record.object_id]);
    return owner?.node_id && owner.node_id !== ROOT_CHILD_ORDER_ID
      ? { kind: 'nodes', nodeIds: [owner.node_id] } : { kind: 'full' };
  }
  if (['setting', 'external_folder', 'watched_folder', 'foreground_source'].includes(record.object_type)) {
    return { kind: 'nodes', nodeIds: [] };
  }
  // External documents and session resume can affect nodes outside this object's identity.
  return { kind: 'full' };
}

export function joinWorkspaceScopes(left: WorkspaceRefreshScope, right: WorkspaceRefreshScope): WorkspaceRefreshScope {
  if (left.kind === 'full' || right.kind === 'full') return { kind: 'full' };
  return { kind: 'nodes', nodeIds: [...new Set([...left.nodeIds, ...right.nodeIds])],
    ...(left.structure || right.structure ? { structure: true } : {}) };
}
