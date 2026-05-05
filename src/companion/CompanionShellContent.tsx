import { FolderTree, ListFilter, X } from 'lucide-react';

import { CompanionBrowseTopActions } from './CompanionBrowseTopActions';
import { CompanionDirectoryContent } from './CompanionDirectoryContent';
import { CompanionOnlyReviewContent } from './CompanionOnlyReviewContent';
import { ImmersiveReadableArticle, ReadableArticleDocument } from './CompanionReadableArticleSurface';
import { RecentArticleList } from './CompanionRecentArticleList';
import { CompanionReviewAnswer, CompanionReviewCard } from './CompanionReviewCard';
import { CompanionReviewFallback } from './CompanionReviewFallback';
import { CompanionSearchContent } from './CompanionSearchContent';
import { CompanionSettingsDetail, CompanionSettingsList } from './CompanionSettingsContent';
import { CompanionSyncContent } from './CompanionSyncContent';
import type { CompanionTabConfig } from './CompanionTabsConfig';
import { CompanionTabsSettingsContent } from './CompanionTabsSettingsContent';
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

function ReadableArticleOrFallback(props: {
  error: string | null;
  hasSnapshot: boolean;
  surface: Surface;
  workspaceSync: WorkspaceSync;
}) {
  if (props.surface.readableArticle) {
    return (
      <ReadableArticleDocument
        readableArticle={props.surface.readableArticle}
        syncEndpointUrl={resolveShellSyncEndpoint(props.workspaceSync)}
      />
    );
  }
  return <CompanionReviewFallback error={props.error} hasSnapshot={props.hasSnapshot} reviewSession={props.surface.reviewSession} />;
}

export function resolveCompanionTopBarProps(
  surface: Surface,
  settingsPage: CompanionSettingsPage,
  isBrowseDirectoryOpen: boolean,
  isOnlyReviewOpen: boolean,
  onOpenBrowseDirectory: () => void,
  onCloseBrowseDirectory: () => void,
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
      return { backLabel: 'Browse', onBack: onCloseBrowseDirectory };
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
  hasSnapshot: boolean;
  isBrowseDirectoryOpen: boolean;
  isOnlyReviewOpen: boolean;
  onBackToSettingsList: () => void;
  companionTabConfig: CompanionTabConfig;
  onCompanionTabConfigChange: (config: CompanionTabConfig) => void;
  onOpenSyncSettingsPage: (page: CompanionSettingsPage) => void;
  onOpenSyncSettings: () => void;
  onOpenTabsSettings: () => void;
  onSelectReviewBreadcrumbItem: (id: string) => void;
  reviewBreadcrumbItems: ReviewBreadcrumbItem[];
  settingsPage: CompanionSettingsPage;
  surface: Surface;
  workspaceError: string | null;
  workspaceSync: WorkspaceSync;
}) {
  if (props.surface.activeAction === 'more') {
    return renderSettingsContent(props);
  }
  if (props.surface.activeAction === 'recent') {
    if (props.isBrowseDirectoryOpen) {
      if (props.surface.readableArticle && props.surface.selectedBrowseNodeId && !props.surface.browsedFolder) {
        return (
          <ImmersiveReadableArticle
            onExit={() => handleExitReadableArticle(props.surface, props.workspaceSync)}
            onSearch={() => props.surface.handleTabAction('search')}
            readableArticle={props.surface.readableArticle}
            syncEndpointUrl={resolveShellSyncEndpoint(props.workspaceSync)}
          />
        );
      }
      return <CompanionDirectoryContent currentNodeId={props.surface.selectedBrowseNodeId} onSelectNode={props.surface.handleSelectBrowseNode} snapshot={props.workspaceSync.state.workspace_snapshot} />;
    }
    return <RecentBrowseContent surface={props.surface} workspaceSync={props.workspaceSync} />;
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
      surface={props.surface}
      workspaceSync={props.workspaceSync}
    />
  );
}

function renderSettingsContent(props: Parameters<typeof renderCompanionShellContent>[0]) {
  if (props.settingsPage === 'list') {
    return <CompanionSettingsList onOpenSync={props.onOpenSyncSettings} onOpenTabs={props.onOpenTabsSettings} />;
  }
  if (props.settingsPage === 'tabs') {
    return (
      <CompanionSettingsDetail onBack={props.onBackToSettingsList} page="tabs" title="Tabs">
        <CompanionTabsSettingsContent
          config={props.companionTabConfig}
          onConfigChange={props.onCompanionTabConfigChange}
        />
      </CompanionSettingsDetail>
    );
  }
  return (
    <CompanionSettingsDetail onBack={props.onBackToSettingsList} page="sync" title="Device sync">
      <CompanionSyncContent
        page={props.settingsPage}
        workspaceSync={props.workspaceSync}
        onOpenSettingsPage={props.onOpenSyncSettingsPage}
      />
    </CompanionSettingsDetail>
  );
}
