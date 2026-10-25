import { useCompanionArticleSurface } from './useCompanionArticleSurface';
import { useCompanionBrowseSortState } from './useCompanionBrowseSortState';
import { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';
import { useFloatingBarVisibility } from './useFloatingBarVisibility';

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
