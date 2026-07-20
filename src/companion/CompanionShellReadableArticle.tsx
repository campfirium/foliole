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

import { supportsCompanionNodeMutation } from '@/shared/platform/companionWorkspaceRuntimeRepository';

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
  const nodeMutationProps = supportsCompanionNodeMutation()
    ? {
        onAddExistingHighlightNote: createCompanionExistingHighlightNoteHandler(props.workspaceSync),
        onCreateSelectionAnnotation: createCompanionSelectionAnnotationHandler(props.workspaceSync),
        onDeleteExistingHighlight: createCompanionExistingHighlightDeleteHandler(props.workspaceSync),
        onRestoreFromTrash: createCompanionTrashRestoreHandler(props.workspaceSync),
        onSaveArticleContent: createCompanionTopicContentSaveHandler(props.workspaceSync)
      }
    : {};
  return (
    <ImmersiveReadableArticle
      onAttachmentResourceSynced={() => continueCompanionAttachmentResourceSync(props.workspaceSync)}
      onExit={props.onExit}
      onScrollTopChange={props.surface.handleViewScroll}
      readableArticle={props.surface.readableArticle}
      snapshot={props.workspaceSync.state.workspace_snapshot}
      syncEndpointUrl={resolveShellSyncEndpoint(props.workspaceSync)}
      {...nodeMutationProps}
    />
  );
}
