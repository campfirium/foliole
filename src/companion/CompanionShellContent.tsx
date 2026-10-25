import {
  DEFAULT_FOLDER_LIST_SORT_DIRECTION,
  DEFAULT_FOLDER_LIST_SORT_KEY,
  type FolderListSortDirection,
  type FolderListSortKey
} from '../features/nodes/model/folderListOrdering';

import { CompanionArticleBodyStatusFallback } from './CompanionArticleBodyStatusFallback';
import { CompanionDirectoryContent, type CompanionDirectorySelection } from './CompanionDirectoryContent';
import * as DirectoryArticle from './CompanionDirectoryReadableArticleModel';
import { CompanionFolderArticleList } from './CompanionFolderArticleList';
import { CompanionOnlyReviewContent } from './CompanionOnlyReviewContent';
import { ReadableArticleOrFallback } from './CompanionReadableArticleFallback';
import { resolveCompanionReadingNeighbors } from './companionReadingNeighbors';
import { RecentArticleList } from './CompanionRecentArticleList';
import { CompanionReviewFallback } from './CompanionReviewFallback';
import { renderCompanionSettingsContent } from './CompanionSettingsShellContent';
import {
  CompanionShellReadableArticle,
  continueCompanionAttachmentResourceSync
} from './CompanionShellReadableArticle';
import { renderCompanionShellSearchSurface, type CompanionShellSearchRouteProps } from './CompanionShellSearchSurface';
import { CompanionWorkspaceSyncLoading } from './CompanionWorkspaceSyncLoading';
import { useCompanionArticleSurface } from './useCompanionArticleSurface';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';
import { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type Surface = ReturnType<typeof useCompanionArticleSurface>;
type WorkspaceSync = ReturnType<typeof useCompanionWorkspaceSync>;
type ReviewBreadcrumbItem = { id: string; isCurrent?: boolean; label: string; targetNodeId: string };
type CompanionShellContentProps = CompanionShellSearchRouteProps & {
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
  onOpenSyncSettingsPage: (page: CompanionSettingsPage) => void;
  onOpenSyncSettings: () => void;
  onResetDirectorySelection: () => void;
  onSelectReviewBreadcrumbItem: (id: string) => void;
  reviewBreadcrumbItems: ReviewBreadcrumbItem[];
  settingsPage: CompanionSettingsPage;
  surface: Surface;
  workspaceError: string | null;
  workspaceSync: WorkspaceSync;
};

function handleExitReadableArticle(surface: Surface) {
  surface.handleExitBrowseArticle();
}

function RecentBrowseContent(props: { surface: Surface; workspaceSync: WorkspaceSync; navigation: ReturnType<typeof readingNavigation> }) {
  if (props.surface.browsedFolder) {
    return (
      <>
        <CompanionFolderArticleList
          snapshot={props.workspaceSync.state.workspace_snapshot}
          items={props.surface.browsedFolder.items}
          nodeId={props.surface.browsedFolder.nodeId}
          onSelectNode={props.surface.handleSelectBrowseNode}
        />
      </>
    );
  }
  if (props.surface.readableArticle && props.surface.selectedBrowseNodeId) {
    return (
      <CompanionShellReadableArticle
        navigation={props.navigation}
        onExit={() => handleExitReadableArticle(props.surface)}
        surface={props.surface}
        workspaceSync={props.workspaceSync}
      />
    );
  }
  return (
    <>
      <RecentArticleList
        currentArticleId={props.surface.readableArticle?.nodeId ?? null}
        onSelectArticle={props.surface.handleSelectRecentArticle}
        recentArticles={props.surface.recentArticles}
      />
    </>
  );
}

function readingNavigation(props: CompanionShellContentProps) {
  const targets = resolveCompanionReadingNeighbors({ ...props,
    snapshot: props.workspaceSync.state.workspace_snapshot,
    sort: { sortKey: props.browseSortKey ?? DEFAULT_FOLDER_LIST_SORT_KEY,
      sortDirection: props.browseSortDirection ?? DEFAULT_FOLDER_LIST_SORT_DIRECTION }
  });
  if (!targets.enabled) return undefined;
  const { previous, next } = targets;
  return { key: targets.key,
    previous: previous ? () => props.surface.handleSelectBrowseNode(previous) : undefined,
    next: next ? () => props.surface.handleSelectBrowseNode(next) : undefined
  };
}

function renderRecentContent(props: CompanionShellContentProps) {
  const navigation = readingNavigation(props);
  if (props.isBrowseDirectoryOpen) {
    if (
      (props.directorySelection.kind === 'internal' ||
        props.directorySelection.kind === 'trash' ||
        props.directorySelection.kind === 'trashFolder' ||
        props.directorySelection.kind === 'virtual') &&
      DirectoryArticle.canRenderCompanionDirectoryArticle(props)
    ) {
      return (
        <CompanionShellReadableArticle
          onExit={DirectoryArticle.resolveCompanionDirectoryArticleExit(props)}
          navigation={navigation}
          surface={props.surface}
          workspaceSync={props.workspaceSync}
        />
      );
    }
    return (
      <CompanionDirectoryContent
        onChangeSelection={props.onChangeDirectorySelection}
        onExitArticle={(selection) => {
          props.surface.handleExitDirectoryArticle();
          props.onChangeDirectorySelection(selection);
        }}
        onSelectNode={props.surface.handleSelectBrowseNode}
        selection={props.directorySelection}
        snapshot={props.workspaceSync.state.workspace_snapshot}
        sortDirection={props.browseSortDirection ?? DEFAULT_FOLDER_LIST_SORT_DIRECTION}
        sortKey={props.browseSortKey ?? DEFAULT_FOLDER_LIST_SORT_KEY}
      />
    );
  }
  return <RecentBrowseContent navigation={navigation} surface={props.surface} workspaceSync={props.workspaceSync} />;
}

export function renderCompanionShellContent(props: CompanionShellContentProps) {
  if (!props.workspaceSync.isWorkspaceSyncStateReady) {
    return <CompanionWorkspaceSyncLoading />;
  }
  const searchSurface = renderCompanionShellSearchSurface({
    externalDocument: props.searchExternalDocument,
    pdfResult: props.searchPdfResult,
    searchMatch: props.searchMatch,
    isTopicOpen: props.isSearchArticleOpen,
    onExitExternalDocument: props.onExitSearchExternalDocument,
    onExitPdf: props.onExitSearchPdf,
    onExitTopic: props.onExitSearchArticle,
    onOpenExternalDocument: props.onOpenSearchExternalDocument,
    onOpenPdf: props.onOpenSearchPdf,
    onOpenTopic: props.onOpenSearchTopic,
    surface: props.surface,
    workspaceSync: props.workspaceSync
  });
  if (searchSurface) return searchSurface;
  if (props.surface.activeAction === 'more') {
    return renderCompanionSettingsContent(props);
  }
  if (props.surface.activeAction === 'recent') {
    return renderRecentContent(props);
  }
  if (props.surface.activeAction === 'review') {
    if (props.surface.flowReady === false) return <CompanionWorkspaceSyncLoading />;
    if (props.surface.effectiveReviewSession.currentCard && props.surface.readableArticle) {
      return <CompanionShellReadableArticle surface={props.surface} workspaceSync={props.workspaceSync}
        onExit={() => props.isOnlyReviewOpen ? props.onBackDirectorySelection() : props.surface.handleTabAction('recent')} flow />;
    }
    if (props.surface.effectiveReviewSession.currentCard) return <CompanionArticleBodyStatusFallback
      bodyStatus="fetching" title={props.surface.effectiveReviewSession.currentCard.title} />;
    if (props.isOnlyReviewOpen) return <CompanionOnlyReviewContent hasSnapshot={props.hasSnapshot}
      isAnswerRevealed={props.surface.isAnswerRevealed} reviewSession={props.surface.onlyReviewSession} />;
    return <CompanionReviewFallback error={props.surface.flowError ?? props.workspaceError} hasSnapshot={props.hasSnapshot}
      hasTopics={props.surface.flowHasTopics} canContinueReading={props.surface.canContinueReading}
      onContinueReading={props.surface.handleContinueReading} />;
  }

  return (
    <ReadableArticleOrFallback
      error={props.workspaceError}
      hasSnapshot={props.hasSnapshot}
      onAttachmentResourceSynced={() => continueCompanionAttachmentResourceSync(props.workspaceSync)}
      surface={props.surface}
      workspaceSync={props.workspaceSync}
    />
  );
}
