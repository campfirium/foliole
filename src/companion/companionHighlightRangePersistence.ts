import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { CompanionHighlightReadGuard } from '../shared/platform/companion/reading/companionHighlightRead';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';
import { buildUpdatedTextAnchorNode, type TextAnchorRangeUpdate } from '../shared/textAnchorRangeUpdate';

import { persistExistingHighlightNode } from './companionExistingHighlightPersistence';

export type CompanionHighlightRangeHandler = (nodeId: string, range: TextAnchorRangeUpdate,
  parentContent: string, guard: CompanionHighlightReadGuard) => Promise<string | null>;

export async function persistCompanionHighlightRange(args: {
  deviceId: string;
  nodeId: string;
  range: TextAnchorRangeUpdate;
  parentContent: string;
  guard: CompanionHighlightReadGuard;
  snapshot: WorkspaceSnapshot | null;
}) {
  const snapshot = args.snapshot;
  const node = snapshot?.nodesById[args.nodeId];
  const expectedParent = node?.parentNodeId ? snapshot?.nodesById[node.parentNodeId] : null;
  if (!snapshot || !node || !expectedParent || snapshot.trashedNodeIds.includes(node.id) ||
    snapshot.trashedNodeIds.includes(expectedParent.id)) return null;
  return persistExistingHighlightNode({ deviceId: args.deviceId, node, snapshot, guard: args.guard,
    update: async (current, timestamp) => {
      const parent = isAvailableNativeCompanionRuntime() ? await loadCompanionWorkspaceNode(expectedParent.id) : expectedParent;
      if (!parent || parent.deletedAt || current.deletedAt || current.parentNodeId !== parent.id ||
        parent.currentVersionId !== expectedParent.currentVersionId || parent.content !== args.parentContent) {
        throw new Error('companion_highlight_parent_changed');
      }
      const updated = buildUpdatedTextAnchorNode({ node: current, range: args.range, parentContent: parent.content, timestamp });
      if (!updated) throw new Error('companion_highlight_range_unavailable');
      return updated;
    }
  });
}
