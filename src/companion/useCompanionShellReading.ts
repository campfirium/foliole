import { useCompanionArticleSurface } from './useCompanionArticleSurface';
import { useCompanionBrowseSortState } from './useCompanionBrowseSortState';
import { useCompanionDirectoryReadingSequence } from './useCompanionDirectoryReadingSequence';
import { useCompanionDirectorySelectionState } from './useCompanionDirectorySelectionState';
import { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';
import { useFloatingBarVisibility } from './useFloatingBarVisibility';

export function useDirectoryReadingSequence(
  directoryState: ReturnType<typeof useCompanionDirectorySelectionState>,
  surface: ReturnType<typeof useCompanionArticleSurface>,
  workspaceSync: ReturnType<typeof useCompanionWorkspaceSync>
) {
  return useCompanionDirectoryReadingSequence({
    selection: directoryState.directorySelection,
    selectedNodeId: surface.selectedBrowseNodeId,
    snapshot: workspaceSync.state.workspace_snapshot
  });
}

export function useSortedArticleSurface(
  workspaceSync: ReturnType<typeof useCompanionWorkspaceSync>,
  floatingBar: ReturnType<typeof useFloatingBarVisibility>,
  browseSort: ReturnType<typeof useCompanionBrowseSortState>,
  isOnlyReviewOpen: boolean
) {
  return useCompanionArticleSurface(workspaceSync, floatingBar, {
    sortDirection: browseSort.browseSortDirection,
    sortKey: browseSort.browseSortKey
  }, { isOnlyReviewOpen });
}
