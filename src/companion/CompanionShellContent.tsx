import { FolderTree, ListFilter, X } from 'lucide-react';

import { CompanionBrowseTopActions } from './CompanionBrowseTopActions';
import { CompanionDirectoryContent, type CompanionDirectorySelection } from './CompanionDirectoryContent';
import { CompanionOnlyReviewContent } from './CompanionOnlyReviewContent';
import { ReadableArticleOrFallback } from './CompanionReadableArticleFallback';
import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';
import { RecentArticleList } from './CompanionRecentArticleList';
import { CompanionReviewAnswer, CompanionReviewCard } from './CompanionReviewCard';
import { CompanionReviewFallback } from './CompanionReviewFallback';
import { CompanionSearchContent } from './CompanionSearchContent';
import { renderCompanionSettingsContent } from './CompanionSettingsShellContent';
import type { CompanionTabConfig } from './CompanionTabsConfig';
import { resolveCompanionWorkspaceSyncEndpoint } from './companionWorkspaceSyncEndpoint';
import { useCompanionArticleSurface } from './useCompanionArticleSurface';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';
import { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

import { resolveCompanionBrowseExitNodeId } from '@/shared/platform/companionReadableArticle';
import { NodeBrowseList } from '@/shared/ui';

type Surface = ReturnType<typeof useCompanionArticleSurface>;
type WorkspaceSync = ReturnType<typeof useCompanionWorkspaceSync>;
type ReviewBreadcrumbItem = { id: string; isCurrent?: boolean; label: string; targetNodeId: string };

function resolveShellSyncEndpoint(workspaceSync: WorkspaceSync) {
  return workspaceSync.state
    ? resolveCompanionWorkspaceSyncEndpoint(workspaceSync.state)
    : null;
}

function handleExitReadableArticle(surface: Surface, workspaceSync: WorkspaceSync) {
  const exitNodeId = resolveCompanionBrowseExitNodeId(
    workspaceSync.state.workspace_snapshot,
    surface.selectedBrowseNodeId
  );
  if (exitNodeId) {
    surface.handleSelectBrowseNode(exitNodeId);
    return;
  }
  surface.handleTabAction('recent');
}

function continueAttachmentResourceSync(workspaceSync: WorkspaceSync) {
  const endpointUrl = resolveShellSyncEndpoint(workspaceSync);
  if (!endpointUrl || workspaceSync.status === 'syncing') {
    return;
  }
  void workspaceSync.pullFromDesktop(endpointUrl).catch(() => undefined);
}

function RecentBrowseContent(props: { surface: Surface; workspaceSync: WorkspaceSync }) {
  const syncEndpointUrl = resolveShellSyncEndpoint(props.workspaceSync);
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
    return (
      <ImmersiveReadableArticle
        onAttachmentResourceSynced={() => continueAttachmentResourceSync(props.workspaceSync)}
        onExit={() => handleExitReadableArticle(props.surface, props.workspaceSync)}
        onSearch={() => props.surface.handleTabAction('search')}
        readableArticle={props.surface.readableArticle}
        syncEndpointUrl={syncEndpointUrl}
      />
    );
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
      props.directorySelection.kind === 'internal' &&
      props.surface.readableArticle &&
      props.surface.selectedBrowseNodeId &&
      !props.surface.browsedFolder
    ) {
      return (
        <ImmersiveReadableArticle
          onAttachmentResourceSynced={() => continueAttachmentResourceSync(props.workspaceSync)}
          onExit={props.onBackDirectorySelection}
          onSearch={() => props.surface.handleTabAction('search')}
          readableArticle={props.surface.readableArticle}
          syncEndpointUrl={resolveShellSyncEndpoint(props.workspaceSync)}
        />
      );
    }
    if (
      props.directorySelection.kind === 'virtual' &&
      props.surface.readableArticle &&
      props.surface.selectedBrowseNodeId &&
      !props.surface.browsedFolder
    ) {
      return (
        <ImmersiveReadableArticle
          onAttachmentResourceSynced={() => continueAttachmentResourceSync(props.workspaceSync)}
          onExit={props.onBackDirectorySelection}
          onSearch={() => props.surface.handleTabAction('search')}
          readableArticle={props.surface.readableArticle}
          syncEndpointUrl={resolveShellSyncEndpoint(props.workspaceSync)}
        />
      );
    }
    return (
      <CompanionDirectoryContent
        onChangeSelection={props.onChangeDirectorySelection}
        onSearch={() => props.surface.handleTabAction('search')}
        onSelectNode={props.surface.handleSelectBrowseNode}
        selection={props.directorySelection}
        snapshot={props.workspaceSync.state.workspace_snapshot}
      />
    );
  }
  return <RecentBrowseContent surface={props.surface} workspaceSync={props.workspaceSync} />;
}

export function resolveCompanionTopBarProps(
  surface: Surface,
  settingsPage: CompanionSettingsPage,
  isBrowseDirectoryOpen: boolean,
  isOnlyReviewOpen: boolean,
  directorySelection: CompanionDirectorySelection,
  onOpenBrowseDirectory: () => void,
  onCloseBrowseDirectory: () => void,
  onResetDirectorySelection: () => void,
  onBackDirectorySelection: () => void,
  onOpenAddSheet: () => void,
  onOpenOnlyReview: () => void,
  onCloseOnlyReview: () => void,
  onExitReview: () => void,
  onBackToSettingsList: () => void,
  onBackToSyncSettings: () => void
) {
  if (surface.activeAction === 'more') {
    if (settingsPage === 'sync') {
      return { backLabel: 'Settings', onBack: onBackToSettingsList, title: 'Device sync' };
    }
    if (settingsPage === 'tabs') {
      return { backLabel: 'Settings', onBack: onBackToSettingsList, title: 'Tabs' };
    }
    if (settingsPage === 'syncActivity') {
      return { backLabel: 'Device sync', onBack: onBackToSyncSettings, title: 'Activity' };
    }
    if (settingsPage === 'syncConnection') {
      return { backLabel: 'Device sync', onBack: onBackToSyncSettings, title: 'Connection' };
    }
    if (settingsPage === 'syncDiagnostics') {
      return { backLabel: 'Device sync', onBack: onBackToSyncSettings, title: 'Sync diagnostic' };
    }
    if (settingsPage === 'syncHandoff') {
      return { backLabel: 'Device sync', onBack: onBackToSyncSettings, title: 'Handoff reminders' };
    }
    return {};
  }
  if (surface.activeAction === 'recent') {
    if (isBrowseDirectoryOpen) {
      return directorySelection.kind === 'root'
        ? {}
        : { backLabel: 'Back', onBack: onBackDirectorySelection };
    }
    return {
      leftAction: { icon: FolderTree, label: 'Directory', onClick: onOpenBrowseDirectory },
      rightSlot: <CompanionBrowseTopActions onOpenCapture={onOpenAddSheet} />,
    };
  }
  if (surface.activeAction === 'search') {
    return {};
  }
  if (isOnlyReviewOpen) {
    return { backLabel: 'Learn', onBack: onCloseOnlyReview, title: 'Only Review' };
  }
  return {
    leftAction: { icon: X, label: 'Exit', onClick: onExitReview },
    rightAction: { icon: ListFilter, label: 'Only Review', onClick: onOpenOnlyReview },
  };
}

export function renderCompanionShellContent(props: {
  directorySelection: CompanionDirectorySelection;
  hasSnapshot: boolean;
  isBrowseDirectoryOpen: boolean;
  isOnlyReviewOpen: boolean;
  onBackToSettingsList: () => void;
  onBackDirectorySelection: () => void;
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
