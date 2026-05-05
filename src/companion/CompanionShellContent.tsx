import { useState } from 'react';

import { CompanionArticleDocument } from './CompanionArticleDocument';
import { RecentArticleList } from './CompanionRecentArticleList';
import { CompanionReviewAnswer, CompanionReviewCard } from './CompanionReviewCard';
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

function formatDueLabel(timestamp: string | null) {
  return timestamp ? new Date(timestamp).toLocaleString() : null;
}

function ReviewFallback(props: {
  error: string | null;
  hasSnapshot: boolean;
  reviewSession: Surface['reviewSession'];
}) {
  const nextFsrsLabel = formatDueLabel(props.reviewSession.nextFsrsDueAt);
  const nextReadingLabel = formatDueLabel(props.reviewSession.nextReadingDueAt);
  const hasScheduledReviews = props.reviewSession.scheduledFsrsCount > 0 || props.reviewSession.scheduledReadingCount > 0;

  return (
    <section className="border-t border-companion-divider px-1 py-6 text-sm leading-6 text-companion-text-secondary">
      {props.hasSnapshot ? (
        <>
          <p>{hasScheduledReviews ? 'No review items are due right now.' : 'No review items have been scheduled on this device yet.'}</p>
          {nextReadingLabel ? <p className="mt-3">Next reading topic: {nextReadingLabel}</p> : null}
          {nextFsrsLabel ? <p className="mt-2">Next FSRS card: {nextFsrsLabel}</p> : null}
          <p className="mt-3">
            {hasScheduledReviews
              ? `Synced review state: ${props.reviewSession.scheduledReadingCount} reading topics, ${props.reviewSession.scheduledFsrsCount} FSRS cards.`
              : 'Pull a newer snapshot when you want this device to refresh upcoming review work.'}
          </p>
        </>
      ) : (
        <>
          <p>No topics have been synced to this device yet.</p>
          <p className="mt-3">
            Connect this device with desktop and keep both devices on the same network.
          </p>
        </>
      )}
      {props.error ? <span className="mt-4 block text-error">{props.error}</span> : null}
    </section>
  );
}

function ReadableArticleBodyStatusFallback(props: {
  bodyStatus: ReadableArticle['bodyStatus'];
}) {
  if (props.bodyStatus === 'missing') {
    return (
      <section className="border-t border-companion-divider px-1 py-6 text-sm leading-6 text-companion-text-secondary">
        <p>Topic content is still syncing.</p>
        <p className="mt-3">Keep this device connected to desktop and try again shortly.</p>
      </section>
    );
  }
  if (props.bodyStatus === 'fetching') {
    return (
      <section className="border-t border-companion-divider px-1 py-6 text-sm leading-6 text-companion-text-secondary">
        <p>Topic content is downloading.</p>
        <p className="mt-3">Keep this device connected to desktop.</p>
      </section>
    );
  }
  if (props.bodyStatus === 'failed') {
    return (
      <section className="border-t border-companion-divider px-1 py-6 text-sm leading-6 text-companion-text-secondary">
        <p>Topic content could not be synced.</p>
        <p className="mt-3">Reconnect this device to desktop to retry.</p>
      </section>
    );
  }
  if (props.bodyStatus === 'empty') {
    return (
      <section className="border-t border-companion-divider px-1 py-6 text-sm leading-6 text-companion-text-secondary">
        <p>This topic is empty.</p>
      </section>
    );
  }
  return null;
}

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
    return <ReadableArticleBodyStatusFallback bodyStatus={props.readableArticle.bodyStatus} />;
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
    return <ReviewFallback error={props.error} hasSnapshot={props.hasSnapshot} reviewSession={props.surface.reviewSession} />;
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
  return <ReviewFallback error={props.error} hasSnapshot={props.hasSnapshot} reviewSession={props.surface.reviewSession} />;
}

export function resolveCompanionTopBarProps(
  surface: Surface,
  settingsPage: CompanionSettingsPage,
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
    return { title: 'Settings' };
  }
  if (surface.activeAction === 'recent') {
    return { title: 'Recent' };
  }
  if (surface.activeAction === 'search') {
    return { title: 'Search' };
  }
  if (surface.activeAction === 'capture') {
    return { title: 'Capture' };
  }
  return { title: 'Review' };
}

export function renderCompanionShellContent(props: {
  hasSnapshot: boolean;
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
    return <RecentBrowseContent surface={props.surface} workspaceSync={props.workspaceSync} />;
  }
  if (props.surface.activeAction === 'review') {
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
  return <ReadableArticleOrFallback error={props.workspaceError} hasSnapshot={props.hasSnapshot} surface={props.surface} />;
}
