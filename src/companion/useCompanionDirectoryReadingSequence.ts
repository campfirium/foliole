import { useState } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { resolveCompanionFolderViewByNodeId } from '../shared/platform/companionBrowseLists';
import { isCanonicalVisibleNodeId } from '../shared/workspaceCanonicalSelectors';

import type { CompanionDirectorySelection } from './CompanionDirectoryModel';

type ReadingSequence = { folderNodeId: string; nodeIds: readonly string[] };

export function useCompanionDirectoryReadingSequence(args: {
  selection: CompanionDirectorySelection;
  selectedNodeId: string | null;
  snapshot: WorkspaceSnapshot | null;
}) {
  const [sequence, setSequence] = useState<ReadingSequence | null>(null);

  function capture(nodeId: string, nodeIds: readonly string[] | null) {
    setSequence(args.selection.kind === 'internal' && nodeIds?.includes(nodeId)
      ? { folderNodeId: args.selection.nodeId, nodeIds: [...nodeIds] }
      : null);
  }

  let nextTopicNodeId: string | null = null;
  if (sequence && args.selection.kind === 'internal' &&
      args.selection.nodeId === sequence.folderNodeId && args.selectedNodeId && args.snapshot) {
    const currentIndex = sequence.nodeIds.indexOf(args.selectedNodeId);
    for (let index = currentIndex + 1; currentIndex >= 0 && index < sequence.nodeIds.length; index += 1) {
      const nodeId = sequence.nodeIds[index];
      if (!nodeId || !isCanonicalVisibleNodeId(args.snapshot, nodeId)) continue;
      const node = args.snapshot.nodesById[nodeId];
      if (node?.kind !== 'topic' || node.parentNodeId !== sequence.folderNodeId) continue;
      if (resolveCompanionFolderViewByNodeId(args.snapshot, nodeId)) continue;
      nextTopicNodeId = nodeId;
      break;
    }
  }

  return { capture, nextTopicNodeId };
}
