import { isCanonicalTrashedNodeId } from '../shared/workspaceCanonicalSelectors';

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
  const snapshot = args.workspaceSync.state.workspace_snapshot;
  return Boolean(
    args.surface.readableArticle &&
    selectedNodeId &&
    !args.surface.browsedFolder &&
    (!isTrashSelection || (snapshot && isCanonicalTrashedNodeId(snapshot, selectedNodeId)))
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
  return () => {
    args.surface.handleExitDirectoryArticle();
    args.onBackDirectorySelection();
  };
}
