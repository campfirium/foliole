import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { resolveCompanionBrowseSnapshot } from '../shared/platform/companion/browse/companionBrowseSnapshot';
import { resolveCompanionFolderViewByNodeId } from '../shared/platform/companionBrowseLists';
import { isCanonicalVisibleNodeId } from '../shared/workspaceCanonicalSelectors';

import type { CompanionDirectorySelection } from './CompanionDirectoryModel';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';
import type { CompanionBrowseSortState } from './useCompanionBrowseState';

type Surface = ReturnType<typeof useCompanionArticleSurface>;

export function resolveCompanionReadingNeighbors(args: {
  directorySelection: CompanionDirectorySelection;
  isBrowseDirectoryOpen: boolean;
  snapshot: WorkspaceSnapshot | null;
  surface: Pick<Surface, 'selectedBrowseNodeId' | 'browseReturnNodeId' | 'recentArticles'>;
  sort: CompanionBrowseSortState;
}) {
  const snapshot = resolveCompanionBrowseSnapshot(args.snapshot);
  const selection = args.directorySelection;
  const folderId = args.isBrowseDirectoryOpen
    ? selection.kind === 'internal' || selection.kind === 'virtual' ? selection.nodeId : null
    : args.surface.browseReturnNodeId;
  const enabled = !args.isBrowseDirectoryOpen || selection.kind === 'internal' || selection.kind === 'virtual';
  const items = folderId
    ? resolveCompanionFolderViewByNodeId(snapshot, folderId, args.sort.sortKey, args.sort.sortDirection)?.items ?? []
    : args.isBrowseDirectoryOpen ? [] : args.surface.recentArticles;
  const index = args.surface.selectedBrowseNodeId
    ? items.findIndex(item => item.nodeId === args.surface.selectedBrowseNodeId) : -1;
  const isReadable = (nodeId: string) => Boolean(snapshot && isCanonicalVisibleNodeId(snapshot, nodeId) &&
    snapshot.nodesById[nodeId]?.kind === 'topic' && !resolveCompanionFolderViewByNodeId(snapshot, nodeId));
  const current = items[index];
  function adjacent(direction: -1 | 1) {
    if (!enabled || !current || !isReadable(current.nodeId)) return null;
    for (let cursor = index + direction; cursor >= 0 && cursor < items.length; cursor += direction) {
      const item = items[cursor];
      if (item && isReadable(item.nodeId)) return item.nodeId;
    }
    return null;
  }
  return {
    enabled,
    key: args.isBrowseDirectoryOpen ? JSON.stringify(selection) : `browse:${folderId ?? ''}`,
    previous: adjacent(-1),
    next: adjacent(1)
  };
}
