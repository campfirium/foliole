import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderCompanionShellContent } from './CompanionShellContent';

vi.mock('./CompanionShellReadableArticle', () => ({
  CompanionShellReadableArticle: (props: { onOpenNextTopic?: () => void }) => (
    <div>{props.onOpenNextTopic ? <button onClick={props.onOpenNextTopic} type="button">
      Next topic
    </button> : null}</div>
  )
}));

function renderReadingRoute(isBrowseDirectoryOpen: boolean, flow = false) {
  const handleSelectBrowseNode = vi.fn();
  render(renderCompanionShellContent({
    directorySelection: { kind: 'internal', nodeId: 'folder' },
    hasSnapshot: true,
    isBrowseDirectoryOpen,
    isOnlyReviewOpen: false,
    isSearchArticleOpen: false,
    nextDirectoryTopicId: 'B',
    onBackDirectorySelection: vi.fn(),
    onBackToSettingsList: vi.fn(),
    onChangeDirectorySelection: vi.fn(),
    onExitSearchArticle: vi.fn(),
    onExitSearchExternalDocument: vi.fn(),
    onExitSearchPdf: vi.fn(),
    onOpenSearchExternalDocument: vi.fn(),
    onOpenSearchPdf: vi.fn(),
    onOpenSearchTopic: vi.fn(),
    onOpenSyncSettings: vi.fn(),
    onOpenSyncSettingsPage: vi.fn(),
    onResetDirectorySelection: vi.fn(),
    onSelectReviewBreadcrumbItem: vi.fn(),
    reviewBreadcrumbItems: [],
    searchExternalDocument: null,
    searchPdfResult: null,
    settingsPage: 'list',
    surface: {
      activeAction: flow ? 'review' : 'recent', browsedFolder: null, handleSelectBrowseNode,
      effectiveReviewSession: { currentCard: flow ? { nodeId: 'A', title: 'A' } : null },
      readableArticle: { nodeId: 'A' }, recentArticles: [], selectedBrowseNodeId: 'A'
    } as never,
    workspaceError: null,
    workspaceSync: { isWorkspaceSyncStateReady: true, state: { workspace_snapshot: null } } as never
  }));
  return handleSelectBrowseNode;
}

it('opens the next directory topic through normal browse navigation', () => {
  const select = renderReadingRoute(true);
  fireEvent.click(screen.getByRole('button', { name: 'Next topic' }));
  expect(select).toHaveBeenCalledExactlyOnceWith('B');
});

it('does not suggest a directory topic when reading from Recent', () => {
  renderReadingRoute(false);
  expect(screen.queryByRole('button', { name: /Next topic/ })).not.toBeInTheDocument();
});

it('keeps Flow on its own reading actions', () => {
  renderReadingRoute(true, true);
  expect(screen.queryByRole('button', { name: /Next topic/ })).not.toBeInTheDocument();
});
