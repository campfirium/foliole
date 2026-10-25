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
  const ids = enabled && snapshot ? items.filter(item =>
    isCanonicalVisibleNodeId(snapshot, item.nodeId) && snapshot.nodesById[item.nodeId]?.kind === 'topic' &&
    !resolveCompanionFolderViewByNodeId(snapshot, item.nodeId)
  ).map(item => item.nodeId) : [];
  const index = args.surface.selectedBrowseNodeId ? ids.indexOf(args.surface.selectedBrowseNodeId) : -1;
  return {
    enabled,
    key: args.isBrowseDirectoryOpen ? JSON.stringify(selection) : `browse:${folderId ?? ''}`,
    previous: index >= 0 ? ids[index - 1] ?? null : null,
    next: index >= 0 ? ids[index + 1] ?? null : null
  };
}
