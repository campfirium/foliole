import { parseHighlightCardContent } from '../../../../../lib/core/annotations/textAnnotationContent';
import type { WorkspaceSnapshot } from '../../../../../lib/core/database/workspaceSnapshot';
import type { WorkspaceNodeSnapshot } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import { isAvailableNativeCompanionRuntime } from '../../companionWorkspaceRuntimeRepository';
import { loadCompanionWorkspaceNode } from '../runtime/companionWorkspaceNodeStore';

import { getCompanionReadingScope } from './companionReadingScope';

export interface CompanionHighlightReadGuard {
  nodeId: string;
  versionId: string | null | undefined;
  scope: ReturnType<typeof getCompanionReadingScope>;
}
export interface CompanionHighlightRead {
  note: string;
  guard: CompanionHighlightReadGuard;
}

export function assertCompanionHighlightRead(node: WorkspaceNodeSnapshot, guard?: CompanionHighlightReadGuard) {
  if (guard && (guard.scope !== getCompanionReadingScope() || guard.nodeId !== node.id || guard.versionId !== node.currentVersionId)) {
    throw new Error('companion_highlight_node_changed');
  }
}

export async function readCompanionHighlight(snapshot: WorkspaceSnapshot | null, nodeId: string): Promise<CompanionHighlightRead> {
  const expected = snapshot?.nodesById[nodeId];
  if (!expected || snapshot?.trashedNodeIds.includes(nodeId)) throw new Error('companion_highlight_node_unavailable');
  const guard = { nodeId, scope: getCompanionReadingScope(), versionId: expected.currentVersionId };
  const node = isAvailableNativeCompanionRuntime() ? await loadCompanionWorkspaceNode(nodeId) : expected;
  if (!node || node.deletedAt || node.parentNodeId !== expected.parentNodeId || node.anchorLink?.kind !== 'highlight') {
    throw new Error('companion_highlight_node_unavailable');
  }
  assertCompanionHighlightRead(node, guard);
  return { note: parseHighlightCardContent({ content: node.content }).note ?? '', guard };
}
