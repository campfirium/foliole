import { Suspense, lazy } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type { useAppController } from '../hooks/useAppController';

import { EpubImportReleaseModeDialog } from './EpubImportReleaseModeDialog';
import { SyncGroupJoinRequestsDialog } from './SyncGroupJoinRequestsDialog';
import type { WorkspaceSearchResult } from './workspaceSearch';

type AppController = ReturnType<typeof useAppController>;

const DEFAULT_FEEDBACK_ENDPOINT = 'https://feedback.foliole.app/submit';

function loadCommandPalette() {
  return import('./CommandPalette');
}

function loadSearchPalette() {
  return import('./SearchPalette');
}

function loadFeedbackDialog() {
  return import('./FeedbackDialog');
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
      <EpubImportReleaseModeDialog />
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
      endpoint={import.meta.env.VITE_FOLIOLE_FEEDBACK_ENDPOINT || DEFAULT_FEEDBACK_ENDPOINT}
      onClose={onClose}
      open={isOpen}
      turnstileSiteKey={import.meta.env.VITE_FOLIOLE_TURNSTILE_SITE_KEY}
    />
  ) : null;
}

function NavigationOverlays({ controller }: { controller: AppController }) {
  const t = useTranslation();
  return (
    <>
      {controller.goToNodeState.isOpen ? <GoToNodePalette {...controller.goToNodeState} /> : null}
      {controller.moveToNodeState.isOpen ? (
        <GoToNodePalette
          {...controller.moveToNodeState}
          dialogLabel={t('desktop.palette.move.dialog')}
          emptyLabel={t('desktop.palette.move.empty')}
          inputLabel={t('desktop.palette.move.input')}
          noResultsLabel={t('desktop.palette.move.noResults')}
          onSelectNode={controller.moveToNodeState.onOpenNode}
          placeholder={t('desktop.palette.node.placeholder')}
        />
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
