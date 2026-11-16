import type { DatabaseDriver } from './driver.js';
import { loadDerivedNodeOrder, readOrderMembers } from './parentChildOrder.js';
import { listVisibleWorkspaceSnapshotNodeIds } from './workspaceSnapshotContract.js';

/** The list snapshot's `nodeOrder`, read from node lifecycle and parent order only. */
export function loadVisibleWorkspaceNodeOrder(driver: DatabaseDriver) {
  const members = readOrderMembers(driver);
  const trashed = members.filter((member) => member.deleted_at);
  return listVisibleWorkspaceSnapshotNodeIds({
    activeNodeId: null,
    nodeOrder: loadDerivedNodeOrder(driver, members),
    nodesById: Object.fromEntries(members.map((member) => [member.id, {
      id: member.id,
      parentNodeId: member.parent_id,
      ...(member.deleted_at ? { deletedAt: member.deleted_at } : {})
    }])),
    trashedNodeDeletedAtById: Object.fromEntries(trashed.map((member) => [member.id, member.deleted_at ?? undefined])),
    trashedNodeIds: trashed.map((member) => member.id)
  });
}
