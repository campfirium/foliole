import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';
import {
  createCompanionExistingHighlightDeleteHandler,
  createCompanionExistingHighlightNoteHandler,
  createCompanionSelectionAnnotationHandler
} from './companionSelectionAnnotationController';
import { createCompanionTopicContentSaveHandler } from './companionTopicEditingController';
import { createCompanionTrashRestoreHandler } from './companionTrashController';
import { resolveCompanionWorkspaceSyncEndpoint } from './companionWorkspaceSyncEndpoint';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type Surface = ReturnType<typeof useCompanionArticleSurface>;
type WorkspaceSync = ReturnType<typeof useCompanionWorkspaceSync>;

function resolveShellSyncEndpoint(workspaceSync: WorkspaceSync) {
  return workspaceSync.state ? resolveCompanionWorkspaceSyncEndpoint(workspaceSync.state) : null;
}

export function continueCompanionAttachmentResourceSync(workspaceSync: WorkspaceSync) {
  const endpointUrl = resolveShellSyncEndpoint(workspaceSync);
  if (!endpointUrl || workspaceSync.status === 'syncing') {
    return;
  }
  void workspaceSync.pullFromDesktop(endpointUrl).catch(() => undefined);
}

export function CompanionShellReadableArticle(props: { onExit: () => void; surface: Surface; workspaceSync: WorkspaceSync }) {
  if (!props.surface.readableArticle) return null;
  return (
    <ImmersiveReadableArticle
      onAttachmentResourceSynced={() => continueCompanionAttachmentResourceSync(props.workspaceSync)}
      onAddExistingHighlightNote={createCompanionExistingHighlightNoteHandler(props.workspaceSync)}
      onCreateSelectionAnnotation={createCompanionSelectionAnnotationHandler(props.workspaceSync)}
      onDeleteExistingHighlight={createCompanionExistingHighlightDeleteHandler(props.workspaceSync)}
      onExit={props.onExit}
      onRestoreFromTrash={createCompanionTrashRestoreHandler(props.workspaceSync)}
      onSaveArticleContent={createCompanionTopicContentSaveHandler(props.workspaceSync)}
      readableArticle={props.surface.readableArticle}
      snapshot={props.workspaceSync.state.workspace_snapshot}
      syncEndpointUrl={resolveShellSyncEndpoint(props.workspaceSync)}
    />
  );
}
