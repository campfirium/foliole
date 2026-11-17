import { Suspense, lazy } from 'react';

import { APP_FEEDBACK_ENDPOINT } from '../../shared/feedback/feedbackEndpoint';
import type { useAppController } from '../hooks/useAppController';

import { EpubImportReleaseModeDialog } from './EpubImportReleaseModeDialog';
import { FormalImportAccessDialog } from './FormalImportAccessDialog';
import { ReadwiseImportDeviceDialog } from './ReadwiseImportDeviceDialog';
import { SyncGroupJoinRequestsDialog } from './SyncGroupJoinRequestsDialog';
import { WatchedFolderConflictDialog } from './WatchedFolderConflictDialog';
import { WorkspaceMoveToPalette } from './WorkspaceMoveToPalette';
import type { WorkspaceSearchResult } from './workspaceSearch';

type AppController = ReturnType<typeof useAppController>;

function loadCommandPalette() {
  return import('./CommandPalette');
}

function loadSearchPalette() {
  return import('./SearchPalette');
}

function loadFeedbackDialog() {
  return import('../../shared/feedback/FeedbackDialog');
}

function loadGoToNodePalette() {
  return import('./GoToNodePalette');
}

function loadHelpSearch() {
  return import('./HelpSearch');
}

function loadReviewSourceTopicDeleteDialog() {
  return import('./ReviewSourceTopicDeleteDialog');
}

function loadReviewTopicDelayPanel() {
  return import('./ReviewTopicDelayPanel');
}

function loadSearchResultPreviewPanel() {
  return import('./SearchResultPreviewPanel');
}

const MaterialHistoryPalette = lazy(() => import('./MaterialHistoryPalette'));
const CommandPalette = lazy(() =>
  loadCommandPalette().then((module) => ({ default: module.CommandPalette }))
);
const FeedbackDialog = lazy(() =>
  loadFeedbackDialog().then((module) => ({ default: module.FeedbackDialog }))
);
const GoToNodePalette = lazy(() =>
  loadGoToNodePalette().then((module) => ({ default: module.GoToNodePalette }))
);
const HelpSearch = lazy(() =>
  loadHelpSearch().then((module) => ({ default: module.HelpSearch }))
);
const ReviewSourceTopicDeleteDialog = lazy(() =>
  loadReviewSourceTopicDeleteDialog().then((module) => ({
    default: module.ReviewSourceTopicDeleteDialog
  }))
);
const ReviewTopicDelayPanel = lazy(() =>
  loadReviewTopicDelayPanel().then((module) => ({
    default: module.ReviewTopicDelayPanel
  }))
);
const SearchPalette = lazy(() =>
  loadSearchPalette().then((module) => ({ default: module.SearchPalette }))
);
const SearchResultPreviewPanel = lazy(() =>
  loadSearchResultPreviewPanel().then((module) => ({ default: module.SearchResultPreviewPanel }))
);

let appOverlayStackPrewarm: Promise<void> | null = null;

export function prewarmAppOverlayStack() {
  appOverlayStackPrewarm ??= Promise.allSettled([
    loadCommandPalette(),
    loadSearchPalette(),
    loadGoToNodePalette(),
    loadHelpSearch(),
    loadSearchResultPreviewPanel(),
    loadReviewTopicDelayPanel(),
    loadReviewSourceTopicDeleteDialog(),
    loadFeedbackDialog()
  ]).then(() => undefined);
  return appOverlayStackPrewarm;
}

export function AppOverlayStack({
  controller,
  isFeedbackOpen,
  isHelpSearchOpen,
  onCloseFeedback,
  onCloseHelpSearch,
  onCloseSearchPreview,
  searchPreviewResult
}: {
  controller: AppController;
  isFeedbackOpen: boolean;
  isHelpSearchOpen: boolean;
  onCloseFeedback: () => void;
  onCloseHelpSearch: () => void;
  onCloseSearchPreview: () => void;
  searchPreviewResult: WorkspaceSearchResult | null;
}) {
  return (
    <>
      <SyncGroupJoinRequestsDialog />
      <WatchedFolderConflictDialog />
      <ReadwiseImportDeviceDialog />
      <EpubImportReleaseModeDialog />
      <FormalImportAccessDialog />
      <Suspense fallback={null}>
        {controller.paletteState.isOpen ? <CommandPalette {...controller.paletteState} /> : null}
        <FeedbackOverlay isOpen={isFeedbackOpen} onClose={onCloseFeedback} />
        {isHelpSearchOpen ? <HelpSearch isOpen={isHelpSearchOpen} onClose={onCloseHelpSearch} /> : null}
        {controller.searchState.isOpen ? <SearchPalette {...controller.searchState} /> : null}
        <NavigationOverlays controller={controller} />
        <ReviewOverlays controller={controller} />
        <SearchPreviewOverlay
          controller={controller}
          onClose={onCloseSearchPreview}
          result={searchPreviewResult}
        />
      </Suspense>
    </>
  );
}

function FeedbackOverlay({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return isOpen ? (
    <FeedbackDialog
      endpoint={APP_FEEDBACK_ENDPOINT}
      onClose={onClose}
      open={isOpen}
      turnstileSiteKey={import.meta.env.VITE_FOLIOLE_TURNSTILE_SITE_KEY}
    />
  ) : null;
}

function NavigationOverlays({ controller }: { controller: AppController }) {
  return (
    <>
      {controller.goToNodeState.isOpen ? <GoToNodePalette {...controller.goToNodeState} /> : null}
      {controller.materialHistoryState?.isOpen ? <MaterialHistoryPalette {...controller.materialHistoryState} /> : null}
      {controller.moveToNodeState.isOpen ? (
        <WorkspaceMoveToPalette state={controller.moveToNodeState} />
      ) : null}
    </>
  );
}

function ReviewOverlays({ controller }: { controller: AppController }) {
  return (
    <>
      {controller.reviewSourceTopicDeleteDialog.isOpen ? (
        <ReviewSourceTopicDeleteDialog {...controller.reviewSourceTopicDeleteDialog} />
      ) : null}
      {controller.reviewTopicDelayPanel?.isOpen ? <ReviewTopicDelayPanel {...controller.reviewTopicDelayPanel} /> : null}
    </>
  );
}

function SearchPreviewOverlay({
  controller,
  onClose,
  result
}: {
  controller: AppController;
  onClose: () => void;
  result: WorkspaceSearchResult | null;
}) {
  return result ? (
    <SearchResultPreviewPanel
      nodesById={controller.layoutProps.nodeList.nodesById}
      onClose={onClose}
      onOpenResult={(nextResult) => {
        controller.searchState.onOpenResult(nextResult);
        onClose();
      }}
      result={result}
    />
  ) : null;
}
