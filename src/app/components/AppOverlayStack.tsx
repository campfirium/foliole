import { Suspense, lazy } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type { useAppController } from '../hooks/useAppController';

import { CompanionPairingRequestsDialog } from './CompanionPairingRequestsDialog';
import { EpubImportReleaseModeDialog } from './EpubImportReleaseModeDialog';
import type { WorkspaceSearchResult } from './workspaceSearch';

type AppController = ReturnType<typeof useAppController>;

const DEFAULT_FEEDBACK_ENDPOINT = 'https://feedback.foliole.app/submit';

const CommandPalette = lazy(() =>
  import('./CommandPalette').then((module) => ({ default: module.CommandPalette }))
);
const FeedbackDialog = lazy(() =>
  import('./FeedbackDialog').then((module) => ({ default: module.FeedbackDialog }))
);
const GoToNodePalette = lazy(() =>
  import('./GoToNodePalette').then((module) => ({ default: module.GoToNodePalette }))
);
const HelpSearch = lazy(() =>
  import('./HelpSearch').then((module) => ({ default: module.HelpSearch }))
);
const ReviewSourceTopicDeleteDialog = lazy(() =>
  import('./ReviewSourceTopicDeleteDialog').then((module) => ({
    default: module.ReviewSourceTopicDeleteDialog
  }))
);
const ReviewTopicDelayPanel = lazy(() =>
  import('./ReviewTopicDelayPanel').then((module) => ({
    default: module.ReviewTopicDelayPanel
  }))
);
const SearchPalette = lazy(() =>
  import('./SearchPalette').then((module) => ({ default: module.SearchPalette }))
);
const SearchResultPreviewPanel = lazy(() =>
  import('./SearchResultPreviewPanel').then((module) => ({ default: module.SearchResultPreviewPanel }))
);

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
      <CompanionPairingRequestsDialog />
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
