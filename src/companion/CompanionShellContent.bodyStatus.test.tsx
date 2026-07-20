import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderCompanionShellContent } from './CompanionShellContent';

function createSurface(bodyStatus: 'empty' | 'failed' | 'missing', title: string) {
  return {
    activeAction: 'recent',
    browsedFolder: null,
    readableArticle: {
      bodyStatus,
      content: '',
      hideTitleHeading: false,
      nodeId: 'topic-1',
      persistedNodeViewState: null,
      pdfAttachmentId: null,
      textAnchorDecorations: [],
      title
    },
    recentArticles: [],
    selectedBrowseNodeId: 'topic-1'
  };
}

function renderSurface(bodyStatus: 'empty' | 'failed' | 'missing', title: string) {
  return render(renderCompanionShellContent({
    browseSortDirection: 'desc',
    browseSortKey: 'dateLastOpened',
    directorySelection: { kind: 'root' },
    hasSnapshot: true,
    isBrowseDirectoryOpen: false,
    isOnlyReviewOpen: false,
    isSearchArticleOpen: false,
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
    surface: createSurface(bodyStatus, title) as never,
    workspaceError: null,
    workspaceSync: {
      isWorkspaceSyncStateReady: true,
      state: { endpoint_url: null, remembered_targets: [], workspace_snapshot: null }
    } as never
  }));
}

describe('CompanionShellContent body status', () => {
  it('shows a syncing state when the topic body blob is not local yet', () => {
    renderSurface('missing', 'Synced topic');
    expect(screen.getByText('Waiting for topic body.')).toBeInTheDocument();
    expect(screen.getByText('This device has the topic list, but this body has not reached the device yet.')).toBeInTheDocument();
  });

  it('shows an empty state when the selected topic has no body', () => {
    renderSurface('empty', 'Empty topic');
    expect(screen.getByText('This topic is empty.')).toBeInTheDocument();
    expect(screen.queryByText('Waiting for topic body.')).not.toBeInTheDocument();
  });

  it('shows a retryable failed state when body blob sync fails validation', () => {
    renderSurface('failed', 'Failed topic');
    expect(screen.getByText('Topic body could not be loaded.')).toBeInTheDocument();
    expect(screen.getByText('Reconnect this device to desktop to retry.')).toBeInTheDocument();
  });
});
