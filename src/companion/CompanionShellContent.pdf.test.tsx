import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderCompanionShellContent } from './CompanionShellContent';

vi.mock('./CompanionArticleDocument', () => ({
  CompanionArticleDocument: (props: { content: string; onMissingAttachmentResource?: (attachmentId: string) => void }) => (
    <article>
      {props.content}
      <button onClick={() => props.onMissingAttachmentResource?.('inline-att-1')}>Load inline attachment</button>
    </article>
  )
}));

vi.mock('@/features/pdf/components/SimplePdfDocument', () => ({
  SimplePdfDocument: (props: { onBackToText?: () => void }) => (
    <div>
      <div>PDF original viewer</div>
      <button onClick={props.onBackToText}>Text</button>
    </div>
  )
}));

const attachmentSyncMock = vi.hoisted(() => ({
  syncCompanionAttachmentResourceFromDesktop: vi.fn(async () => ({ attachmentId: 'inline-att-1', status: 'cached' }))
}));
const syncObjectMock = vi.hoisted(() => ({
  saveCompanionSyncActiveViewState: vi.fn(async () => ({ content_hash: 'hash-active', object_id: 'active' }))
}));

vi.mock('@/shared/platform/companionDesktopAttachmentResources', () => attachmentSyncMock);
vi.mock('@/shared/platform/companionSyncObjects', () => syncObjectMock);

function createPdfReadableSurface() {
  return {
    activeAction: 'recent',
    browsedFolder: null,
    handleSelectBrowseNode: vi.fn(),
    handleSelectRecentArticle: vi.fn(),
    readableArticle: {
      content: '# Extracted PDF text\n\nReadable body',
      hideTitleHeading: false,
      nodeId: 'topic-1',
      persistedNodeViewState: null,
      pdfAttachmentId: 'pdf-attachment-1',
      textAnchorDecorations: [],
      title: 'Extracted PDF text'
    },
    recentArticles: [],
    selectedBrowseNodeId: 'topic-1'
  };
}

function createSecondPdfReadableSurface() {
  return {
    ...createPdfReadableSurface(),
    readableArticle: {
      content: '# Second PDF text\n\nReadable body',
      hideTitleHeading: false,
      nodeId: 'topic-2',
      persistedNodeViewState: null,
      pdfAttachmentId: 'pdf-attachment-2',
      textAnchorDecorations: [],
      title: 'Second PDF text'
    },
    selectedBrowseNodeId: 'topic-2'
  };
}

function createMissingBodySurface() {
  return {
    ...createPdfReadableSurface(),
    readableArticle: {
      bodyStatus: 'missing',
      content: '',
      hideTitleHeading: false,
      nodeId: 'topic-1',
      persistedNodeViewState: null,
      pdfAttachmentId: null,
      textAnchorDecorations: [],
      title: 'Synced topic'
    }
  };
}

function createEmptyBodySurface() {
  return {
    ...createPdfReadableSurface(),
    readableArticle: {
      bodyStatus: 'empty',
      content: '',
      hideTitleHeading: false,
      nodeId: 'topic-1',
      persistedNodeViewState: null,
      pdfAttachmentId: null,
      textAnchorDecorations: [],
      title: 'Empty topic'
    }
  };
}

function createFailedBodySurface() {
  return {
    ...createPdfReadableSurface(),
    readableArticle: {
      bodyStatus: 'failed',
      content: '',
      hideTitleHeading: false,
      nodeId: 'topic-1',
      persistedNodeViewState: null,
      pdfAttachmentId: null,
      textAnchorDecorations: [],
      title: 'Failed topic'
    }
  };
}

function createWorkspaceSync(overrides: Record<string, unknown> = {}) {
  const state = {
    endpoint_url: null,
    remembered_targets: [],
    workspace_snapshot: null,
    ...((overrides.state as Record<string, unknown> | undefined) ?? {})
  };
  return {
    pullFromDesktop: vi.fn(async () => undefined),
    status: 'idle',
    ...overrides,
    state
  };
}

function renderSurfaceElement(surface: unknown, workspaceSync: unknown = createWorkspaceSync()) {
  return renderCompanionShellContent({
    browseSortDirection: 'desc',
    browseSortKey: 'dateLastOpened',
    directorySelection: { kind: 'root' },
    hasSnapshot: true,
    isBrowseDirectoryOpen: false,
    isOnlyReviewOpen: false,
    onBackDirectorySelection: vi.fn(),
    onChangeDirectorySelection: vi.fn(),
    onBackToSettingsList: vi.fn(),
    onOpenSyncSettingsPage: vi.fn(),
    onOpenSyncSettings: vi.fn(),
    onResetDirectorySelection: vi.fn(),
    onSelectReviewBreadcrumbItem: vi.fn(),
    reviewBreadcrumbItems: [],
    settingsPage: 'list',
    surface: surface as never,
    workspaceError: null,
    workspaceSync: workspaceSync as never
  });
}

function renderSurface(surface: unknown, workspaceSync: unknown = createWorkspaceSync()) {
  return render(renderSurfaceElement(surface, workspaceSync));
}

function testPrimaryPdfReadingSurface() {
  renderSurface(createPdfReadableSurface());

  expect(screen.getByText('Text version')).toBeInTheDocument();
  expect(screen.getByText(/Extracted PDF text/)).toBeInTheDocument();
  expect(screen.queryByText('PDF original viewer')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open PDF' }));
  expect(screen.getByText('PDF original viewer')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Text' }));
  expect(screen.getByText(/Extracted PDF text/)).toBeInTheDocument();
}

async function testInlineAttachmentSync() {
  const pullFromDesktop = vi.fn(async () => undefined);
  renderSurface(createPdfReadableSurface(), {
    pullFromDesktop,
    status: 'idle',
    state: {
      endpoint_url: 'http://10.0.2.2:38641',
      remembered_targets: []
    }
  });

  fireEvent.click(screen.getByRole('button', { name: 'Load inline attachment' }));

  await waitFor(() => expect(syncObjectMock.saveCompanionSyncActiveViewState).toHaveBeenCalledWith('topic-1'));
  expect(attachmentSyncMock.syncCompanionAttachmentResourceFromDesktop).toHaveBeenCalledWith(
    'http://10.0.2.2:38641',
    'inline-att-1'
  );
  await waitFor(() => expect(pullFromDesktop).toHaveBeenCalledWith('http://10.0.2.2:38641'));
}

async function testInlineAttachmentSyncUsesLatestTopic() {
  const workspaceSync = {
    pullFromDesktop: vi.fn(async () => undefined),
    status: 'idle',
    state: {
      endpoint_url: 'http://10.0.2.2:38641',
      remembered_targets: []
    }
  };
  const { rerender } = renderSurface(createPdfReadableSurface(), workspaceSync);
  rerender(renderSurfaceElement(createSecondPdfReadableSurface(), workspaceSync));

  fireEvent.click(screen.getByRole('button', { name: 'Load inline attachment' }));

  await waitFor(() => expect(syncObjectMock.saveCompanionSyncActiveViewState).toHaveBeenCalledWith('topic-2'));
}

function testMissingBodyState() {
  renderSurface(createMissingBodySurface());

  expect(screen.getByText('Waiting for topic body.')).toBeInTheDocument();
  expect(screen.getByText('This device has the topic list, but this body has not reached the device yet.')).toBeInTheDocument();
}

function testEmptyBodyState() {
  renderSurface(createEmptyBodySurface());

  expect(screen.getByText('This topic is empty.')).toBeInTheDocument();
  expect(screen.queryByText('Waiting for topic body.')).not.toBeInTheDocument();
}

function testFailedBodyState() {
  renderSurface(createFailedBodySurface());

  expect(screen.getByText('Topic body could not be loaded.')).toBeInTheDocument();
  expect(screen.getByText('Reconnect this device to desktop to retry.')).toBeInTheDocument();
}

describe('CompanionShellContent PDF articles', () => {
  it('keeps extracted PDF text as the primary mobile reading surface', testPrimaryPdfReadingSurface);
  it('syncs a missing inline attachment from the current topic surface', testInlineAttachmentSync);
  it('syncs a missing inline attachment against the latest topic after switching', testInlineAttachmentSyncUsesLatestTopic);
  it('shows a syncing state when the topic body blob is not local yet', testMissingBodyState);
  it('shows an empty state when the selected topic has no body', testEmptyBodyState);
  it('shows a retryable failed state when body blob sync fails validation', testFailedBodyState);
});
