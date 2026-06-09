import { expect, it, vi } from 'vitest';

const sidebarPrewarmMocks = vi.hoisted(() => ({
  loadBacklinksModule: vi.fn(),
  loadDevModule: vi.fn(),
  loadHighlightsModule: vi.fn(),
  loadOutlineModule: vi.fn(),
  loadPerformanceModule: vi.fn(),
  loadReviewQueueModule: vi.fn()
}));

vi.mock('./WorkspaceRightSidebarOutlinePanel', () => {
  sidebarPrewarmMocks.loadOutlineModule();
  return { WorkspaceRightSidebarOutlinePanel: () => null };
});

vi.mock('./WorkspaceRightSidebarBacklinksPanel', () => {
  sidebarPrewarmMocks.loadBacklinksModule();
  return { WorkspaceRightSidebarBacklinksPanel: () => null };
});

vi.mock('./WorkspaceRightSidebarHighlightsPanel', () => {
  sidebarPrewarmMocks.loadHighlightsModule();
  return { WorkspaceRightSidebarHighlightsPanel: () => null };
});

vi.mock('./WorkspaceRightSidebarReviewQueuePanel', () => {
  sidebarPrewarmMocks.loadReviewQueueModule();
  return { WorkspaceRightSidebarReviewQueuePanel: () => null };
});

vi.mock('./WorkspaceRightSidebarDevPanel', () => {
  sidebarPrewarmMocks.loadDevModule();
  return { WorkspaceRightSidebarDevPanel: () => null };
});

vi.mock('./WorkspaceRightSidebarPerformancePanel', () => {
  sidebarPrewarmMocks.loadPerformanceModule();
  return { WorkspaceRightSidebarPerformancePanel: () => null };
});

it('prewarms lazy right sidebar panel modules once after startup', async () => {
  const { prewarmWorkspaceRightSidebarPanels } = await import('./workspaceRightSidebarPanelLoaders');

  await prewarmWorkspaceRightSidebarPanels();
  await prewarmWorkspaceRightSidebarPanels();

  expect(sidebarPrewarmMocks.loadOutlineModule).toHaveBeenCalledTimes(1);
  expect(sidebarPrewarmMocks.loadBacklinksModule).toHaveBeenCalledTimes(1);
  expect(sidebarPrewarmMocks.loadHighlightsModule).toHaveBeenCalledTimes(1);
  expect(sidebarPrewarmMocks.loadReviewQueueModule).toHaveBeenCalledTimes(1);
  expect(sidebarPrewarmMocks.loadDevModule).toHaveBeenCalledTimes(1);
  expect(sidebarPrewarmMocks.loadPerformanceModule).toHaveBeenCalledTimes(1);
});
