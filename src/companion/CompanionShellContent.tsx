import { FolderTree, ListFilter, Plus, X } from 'lucide-react';
import { useState } from 'react';

import { CompanionArticleBodyStatusFallback } from './CompanionArticleBodyStatusFallback';
import { CompanionArticleDocument } from './CompanionArticleDocument';
import { CompanionDirectoryContent } from './CompanionDirectoryContent';
import { CompanionOnlyReviewContent } from './CompanionOnlyReviewContent';
import { RecentArticleList } from './CompanionRecentArticleList';
import { CompanionReviewAnswer, CompanionReviewCard } from './CompanionReviewCard';
import { CompanionReviewFallback } from './CompanionReviewFallback';
import { CompanionSearchContent } from './CompanionSearchContent';
import { CompanionSettingsDetail, CompanionSettingsList } from './CompanionSettingsContent';
import { CompanionSyncContent } from './CompanionSyncContent';
import { useCompanionArticleSurface } from './useCompanionArticleSurface';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';
import { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

import { SimplePdfDocument } from '@/features/pdf/components/SimplePdfDocument';
import { AppButton, NodeBrowseList } from '@/shared/ui';

type Surface = ReturnType<typeof useCompanionArticleSurface>;
type WorkspaceSync = ReturnType<typeof useCompanionWorkspaceSync>;
type ReviewBreadcrumbItem = { id: string; isCurrent?: boolean; label: string; targetNodeId: string };
type ReadableArticle = NonNullable<Surface['readableArticle']>;

function ReadableArticleDocument(props: {
  readableArticle: ReadableArticle;
}) {
  const [isViewingPdfOriginal, setIsViewingPdfOriginal] = useState(false);
  const pdfAttachmentId = props.readableArticle.pdfAttachmentId;

  if (pdfAttachmentId && isViewingPdfOriginal) {
    return (
      <SimplePdfDocument
        attachmentId={pdfAttachmentId}
        onBackToText={() => setIsViewingPdfOriginal(false)}
        title={props.readableArticle.title}
      />
    );
  }
  if (props.readableArticle.bodyStatus && props.readableArticle.bodyStatus !== 'ready') {
    return <CompanionArticleBodyStatusFallback bodyStatus={props.readableArticle.bodyStatus} />;
  }

  return (
    <>
      {pdfAttachmentId ? (
        <div className="mb-3 flex items-center justify-between border-b border-companion-divider px-1 pb-3">
          <span className="text-xs text-companion-text-secondary">Text version</span>
          <AppButton onClick={() => setIsViewingPdfOriginal(true)} variant="ghost">
            Open PDF
          </AppButton>
        </div>
      ) : null}
      <CompanionArticleDocument
        content={props.readableArticle.content}
        hideTitleHeading={props.readableArticle.hideTitleHeading}
        nodeId={props.readableArticle.nodeId}
        textAnchorDecorations={props.readableArticle.textAnchorDecorations}
      />
    </>
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
    return <ReadableArticleDocument readableArticle={props.surface.readableArticle} />;
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
}) {
  if (props.surface.readableArticle) {
    return <ReadableArticleDocument readableArticle={props.surface.readableArticle} />;
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
      return { backLabel: 'Browse', onBack: onCloseBrowseDirectory, title: 'Directory' };
    }
    return {
      leftAction: { icon: FolderTree, label: 'Directory', onClick: onOpenBrowseDirectory },
      rightAction: { icon: Plus, label: 'Add', onClick: onOpenAddSheet },
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
  onOpenSyncSettingsPage: (page: CompanionSettingsPage) => void;
  onOpenSyncSettings: () => void;
  onSelectReviewBreadcrumbItem: (id: string) => void;
  reviewBreadcrumbItems: ReviewBreadcrumbItem[];
  settingsPage: CompanionSettingsPage;
  surface: Surface;
  workspaceError: string | null;
  workspaceSync: WorkspaceSync;
}) {
  if (props.surface.activeAction === 'more') {
    return props.settingsPage !== 'list' ? (
      <CompanionSettingsDetail onBack={props.onBackToSettingsList} page="sync" title="Device sync">
        <CompanionSyncContent
          page={props.settingsPage}
          workspaceSync={props.workspaceSync}
          onOpenSettingsPage={props.onOpenSyncSettingsPage}
        />
      </CompanionSettingsDetail>
    ) : (
      <CompanionSettingsList onOpenSync={props.onOpenSyncSettings} />
    );
  }
  if (props.surface.activeAction === 'recent') {
    if (props.isBrowseDirectoryOpen) {
      return <CompanionDirectoryContent />;
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
  return <ReadableArticleOrFallback error={props.workspaceError} hasSnapshot={props.hasSnapshot} surface={props.surface} />;
}
