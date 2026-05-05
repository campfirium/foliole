import {
  DEFAULT_FOLDER_LIST_SORT_DIRECTION,
  DEFAULT_FOLDER_LIST_SORT_KEY,
  type FolderListSortDirection,
  type FolderListSortKey
} from '../features/nodes/model/folderListOrdering';

import { CompanionDirectoryContent, type CompanionDirectorySelection } from './CompanionDirectoryContent';
import * as DirectoryArticle from './CompanionDirectoryReadableArticleModel';
import { CompanionOnlyReviewContent } from './CompanionOnlyReviewContent';
import { ReadableArticleOrFallback } from './CompanionReadableArticleFallback';
import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';
import { RecentArticleList } from './CompanionRecentArticleList';
import { CompanionReviewAnswer, CompanionReviewCard } from './CompanionReviewCard';
import { CompanionReviewFallback } from './CompanionReviewFallback';
import { CompanionSearchContent } from './CompanionSearchContent';
import {
  createCompanionExistingHighlightDeleteHandler,
  createCompanionExistingHighlightNoteHandler,
  createCompanionSelectionAnnotationHandler
} from './companionSelectionAnnotationController';
import { renderCompanionSettingsContent } from './CompanionSettingsShellContent';
import type { CompanionTabConfig } from './CompanionTabsConfig';
import { createCompanionTopicContentSaveHandler } from './companionTopicEditingController';
import { createCompanionTrashRestoreHandler } from './companionTrashController';
import { resolveCompanionWorkspaceSyncEndpoint } from './companionWorkspaceSyncEndpoint';
import { useCompanionArticleSurface } from './useCompanionArticleSurface';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';
import { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

import { NodeBrowseList } from '@/shared/ui';

type Surface = ReturnType<typeof useCompanionArticleSurface>;
type WorkspaceSync = ReturnType<typeof useCompanionWorkspaceSync>;
type ReviewBreadcrumbItem = { id: string; isCurrent?: boolean; label: string; targetNodeId: string };

function resolveShellSyncEndpoint(workspaceSync: WorkspaceSync) {
  return workspaceSync.state
    ? resolveCompanionWorkspaceSyncEndpoint(workspaceSync.state)
    : null;
}

function handleExitReadableArticle(surface: Surface) {
  surface.handleExitBrowseArticle();
}

function continueAttachmentResourceSync(workspaceSync: WorkspaceSync) {
  const endpointUrl = resolveShellSyncEndpoint(workspaceSync);
  if (!endpointUrl || workspaceSync.status === 'syncing') {
    return;
  }
  void workspaceSync.pullFromDesktop(endpointUrl).catch(() => undefined);
}

function renderReadableArticle(props: {
  onExit: () => void;
  surface: Surface;
  workspaceSync: WorkspaceSync;
}) {
  if (!props.surface.readableArticle) return null;
  return (
    <ImmersiveReadableArticle
      onAttachmentResourceSynced={() => continueAttachmentResourceSync(props.workspaceSync)}
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

function RecentBrowseContent(props: { surface: Surface; workspaceSync: WorkspaceSync }) {
  if (props.surface.browsedFolder) {
    return (
      <NodeBrowseList
        currentNodeId={props.surface.selectedBrowseNodeId}
        emptyLabel="This folder does not have any synced topics or folders yet."
        items={props.surface.browsedFolder.items}
        onSelectNode={props.surface.handleSelectBrowseNode}
      />
    );
  }
  if (props.surface.readableArticle && props.surface.selectedBrowseNodeId) {
    return renderReadableArticle({
      onExit: () => handleExitReadableArticle(props.surface),
      surface: props.surface,
      workspaceSync: props.workspaceSync
    });
  }
  return (
    <RecentArticleList
      currentArticleId={props.surface.readableArticle?.nodeId ?? null}
      onSelectArticle={props.surface.handleSelectRecentArticle}
      recentArticles={props.surface.recentArticles}
    />
  );
}

function ReviewContent(props: {
  error: string | null;
  hasSnapshot: boolean;
  onSelectBreadcrumbItem: (id: string) => void;
  reviewBreadcrumbItems: ReviewBreadcrumbItem[];
  surface: Surface;
}) {
  if (!props.surface.reviewSession.currentCard) {
    return <CompanionReviewFallback error={props.error} hasSnapshot={props.hasSnapshot} reviewSession={props.surface.reviewSession} />;
  }

  return (
    <>
      <CompanionReviewCard
        breadcrumbItems={props.reviewBreadcrumbItems}
        card={props.surface.reviewSession.currentCard}
        onSelectBreadcrumbItem={props.onSelectBreadcrumbItem}
      />
      {props.surface.reviewSession.currentCard.itemKind === 'fsrs' && props.surface.isAnswerRevealed ? (
        <CompanionReviewAnswer card={props.surface.reviewSession.currentCard} />
      ) : null}
      {props.surface.readingError ? <p className="mt-3 text-sm text-error">{props.surface.readingError}</p> : null}
      {props.surface.reviewError ? <p className="mt-3 text-sm text-error">{props.surface.reviewError}</p> : null}
    </>
  );
}

function renderRecentContent(props: Parameters<typeof renderCompanionShellContent>[0]) {
  if (props.isBrowseDirectoryOpen) {
    if (
      (
        props.directorySelection.kind === 'internal' ||
        props.directorySelection.kind === 'trash' ||
        props.directorySelection.kind === 'trashFolder' ||
        props.directorySelection.kind === 'virtual'
      ) &&
      DirectoryArticle.canRenderCompanionDirectoryArticle(props)
    ) {
      return renderReadableArticle({
        onExit: DirectoryArticle.resolveCompanionDirectoryArticleExit(props),
        surface: props.surface,
        workspaceSync: props.workspaceSync
      });
    }
    return (
      <CompanionDirectoryContent
        onChangeSelection={props.onChangeDirectorySelection}
        onSelectNode={props.surface.handleSelectBrowseNode}
        selection={props.directorySelection}
        snapshot={props.workspaceSync.state.workspace_snapshot}
        sortDirection={props.browseSortDirection ?? DEFAULT_FOLDER_LIST_SORT_DIRECTION}
        sortKey={props.browseSortKey ?? DEFAULT_FOLDER_LIST_SORT_KEY}
      />
    );
  }
  return <RecentBrowseContent surface={props.surface} workspaceSync={props.workspaceSync} />;
}

export function renderCompanionShellContent(props: {
  directorySelection: CompanionDirectorySelection;
  browseSortDirection?: FolderListSortDirection;
  browseSortKey?: FolderListSortKey;
  hasSnapshot: boolean;
  isBrowseDirectoryOpen: boolean;
  isOnlyReviewOpen: boolean;
  onBackToSettingsList: () => void;
  onBackDirectorySelection: () => void;
  onChangeBrowseSortDirection?: (sortDirection: FolderListSortDirection) => void;
  onChangeBrowseSortKey?: (sortKey: FolderListSortKey) => void;
  onChangeDirectorySelection: (selection: CompanionDirectorySelection) => void;
  companionTabConfig: CompanionTabConfig;
  onCompanionTabConfigChange: (config: CompanionTabConfig) => void;
  onOpenSyncSettingsPage: (page: CompanionSettingsPage) => void;
  onOpenSyncSettings: () => void;
  onOpenTabsSettings: () => void;
  onResetDirectorySelection: () => void;
  onSelectReviewBreadcrumbItem: (id: string) => void;
  reviewBreadcrumbItems: ReviewBreadcrumbItem[];
  settingsPage: CompanionSettingsPage;
  surface: Surface;
  workspaceError: string | null;
  workspaceSync: WorkspaceSync;
}) {
  if (props.surface.activeAction === 'more') {
    return renderCompanionSettingsContent(props);
  }
  if (props.surface.activeAction === 'recent') {
    return renderRecentContent(props);
  }
  if (props.surface.activeAction === 'review') {
    if (props.isOnlyReviewOpen) {
      return <CompanionOnlyReviewContent />;
    }
    return (
      <ReviewContent
        error={props.workspaceError}
        hasSnapshot={props.hasSnapshot}
        onSelectBreadcrumbItem={props.onSelectReviewBreadcrumbItem}
        reviewBreadcrumbItems={props.reviewBreadcrumbItems}
        surface={props.surface}
      />
    );
  }
  if (props.surface.activeAction === 'search') {
    return <CompanionSearchContent />;
  }
  return (
    <ReadableArticleOrFallback
      error={props.workspaceError}
      hasSnapshot={props.hasSnapshot}
      onAttachmentResourceSynced={() => continueAttachmentResourceSync(props.workspaceSync)}
      surface={props.surface}
      workspaceSync={props.workspaceSync}
    />
  );
}
