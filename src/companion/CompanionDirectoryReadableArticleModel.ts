import type { CompanionDirectorySelection } from './CompanionDirectoryModel';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

export function canRenderCompanionDirectoryArticle(args: {
  directorySelection: CompanionDirectorySelection;
  surface: ReturnType<typeof useCompanionArticleSurface>;
  workspaceSync: ReturnType<typeof useCompanionWorkspaceSync>;
}) {
  const selectedNodeId = args.surface.selectedBrowseNodeId;
  const isTrashSelection = args.directorySelection.kind === 'trash' || args.directorySelection.kind === 'trashFolder';
  return Boolean(
    args.surface.readableArticle &&
    selectedNodeId &&
    !args.surface.browsedFolder &&
    (!isTrashSelection || args.workspaceSync.state.workspace_snapshot?.trashedNodeIds.includes(selectedNodeId))
  );
}

export function resolveCompanionDirectoryArticleExit(args: {
  directorySelection: CompanionDirectorySelection;
  onBackDirectorySelection(): void;
  surface: ReturnType<typeof useCompanionArticleSurface>;
}) {
  if (args.directorySelection.kind === 'trash' || args.directorySelection.kind === 'trashFolder') {
    return () => args.surface.handleTabAction('recent');
  }
  return args.onBackDirectorySelection;
}
