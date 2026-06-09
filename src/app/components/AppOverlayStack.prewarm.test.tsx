import { expect, it, vi } from 'vitest';

const overlayPrewarmMocks = vi.hoisted(() => ({
  loadCommandPaletteModule: vi.fn(),
  loadFeedbackDialogModule: vi.fn(),
  loadGoToNodePaletteModule: vi.fn(),
  loadHelpSearchModule: vi.fn(),
  loadReviewSourceTopicDeleteDialogModule: vi.fn(),
  loadReviewTopicDelayPanelModule: vi.fn(),
  loadSearchResultPreviewPanelModule: vi.fn(),
  loadSearchPaletteModule: vi.fn()
}));

vi.mock('./CommandPalette', () => {
  overlayPrewarmMocks.loadCommandPaletteModule();
  return {
    CommandPalette: () => null
  };
});

vi.mock('./SearchPalette', () => {
  overlayPrewarmMocks.loadSearchPaletteModule();
  return {
    SearchPalette: () => null
  };
});

vi.mock('./GoToNodePalette', () => {
  overlayPrewarmMocks.loadGoToNodePaletteModule();
  return {
    GoToNodePalette: () => null
  };
});

vi.mock('./HelpSearch', () => {
  overlayPrewarmMocks.loadHelpSearchModule();
  return {
    HelpSearch: () => null
  };
});

vi.mock('./SearchResultPreviewPanel', () => {
  overlayPrewarmMocks.loadSearchResultPreviewPanelModule();
  return {
    SearchResultPreviewPanel: () => null
  };
});

vi.mock('./ReviewTopicDelayPanel', () => {
  overlayPrewarmMocks.loadReviewTopicDelayPanelModule();
  return {
    ReviewTopicDelayPanel: () => null
  };
});

vi.mock('./ReviewSourceTopicDeleteDialog', () => {
  overlayPrewarmMocks.loadReviewSourceTopicDeleteDialogModule();
  return {
    ReviewSourceTopicDeleteDialog: () => null
  };
});

vi.mock('./FeedbackDialog', () => {
  overlayPrewarmMocks.loadFeedbackDialogModule();
  return {
    FeedbackDialog: () => null
  };
});

it('prewarms lazy overlay modules once after startup', async () => {
  const { prewarmAppOverlayStack } = await import('./AppOverlayStack');

  await prewarmAppOverlayStack();
  await prewarmAppOverlayStack();

  expect(overlayPrewarmMocks.loadCommandPaletteModule).toHaveBeenCalledTimes(1);
  expect(overlayPrewarmMocks.loadSearchPaletteModule).toHaveBeenCalledTimes(1);
  expect(overlayPrewarmMocks.loadGoToNodePaletteModule).toHaveBeenCalledTimes(1);
  expect(overlayPrewarmMocks.loadHelpSearchModule).toHaveBeenCalledTimes(1);
  expect(overlayPrewarmMocks.loadSearchResultPreviewPanelModule).toHaveBeenCalledTimes(1);
  expect(overlayPrewarmMocks.loadReviewTopicDelayPanelModule).toHaveBeenCalledTimes(1);
  expect(overlayPrewarmMocks.loadReviewSourceTopicDeleteDialogModule).toHaveBeenCalledTimes(1);
  expect(overlayPrewarmMocks.loadFeedbackDialogModule).toHaveBeenCalledTimes(1);
});
