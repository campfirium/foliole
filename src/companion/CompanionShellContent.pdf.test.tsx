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
  SimplePdfDocument: (props: {
    onBackToText?: () => void;
    onMissingResource?: (attachmentId: string) => void;
  }) => (
    <div>
      <div>PDF original viewer</div>
      {props.onBackToText ? <button onClick={props.onBackToText}>Text</button> : null}
      <button onClick={() => props.onMissingResource?.('pdf-attachment-1')}>Load PDF attachment</button>
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

function createPdfSurface(content: string, bodyStatus: 'empty' | 'ready' = 'ready') {
  const surface = createPdfReadableSurface();
  return {
    ...surface,
    readableArticle: {
      ...surface.readableArticle,
      bodyStatus,
      content
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
    isWorkspaceSyncStateReady: true,
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
    isSearchArticleOpen: false,
    onExitSearchExternalDocument: vi.fn(),
    onExitSearchPdf: vi.fn(),
    onBackDirectorySelection: vi.fn(),
    onChangeDirectorySelection: vi.fn(),
    onBackToSettingsList: vi.fn(),
    onExitSearchArticle: vi.fn(),
    onOpenSyncSettingsPage: vi.fn(),
    onOpenSyncSettings: vi.fn(),
    onOpenSearchExternalDocument: vi.fn(),
    onOpenSearchPdf: vi.fn(),
    onOpenSearchTopic: vi.fn(),
    onResetDirectorySelection: vi.fn(),
    onSelectReviewBreadcrumbItem: vi.fn(),
    reviewBreadcrumbItems: [],
    searchExternalDocument: null,
    searchPdfResult: null,
    settingsPage: 'list',
    surface: surface as never,
    workspaceError: null,
    workspaceSync: workspaceSync as never
  });
}

function renderSurface(surface: unknown, workspaceSync: unknown = createWorkspaceSync()) {
  return render(renderSurfaceElement(surface, workspaceSync));
}

async function testPrimaryPdfReadingSurface() {
  renderSurface(createPdfReadableSurface());

  expect(screen.getByText('Text version')).toBeInTheDocument();
  expect(screen.getAllByText(/Extracted PDF text/).length).toBeGreaterThan(0);
  expect(screen.queryByText('PDF original viewer')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open PDF' }));
  expect(await screen.findByText('PDF original viewer')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Text' }));
  expect(screen.getAllByText(/Extracted PDF text/).length).toBeGreaterThan(0);
}

async function testInlineAttachmentSync() {
  const pullFromDesktop = vi.fn(async () => undefined);
  renderSurface(createPdfReadableSurface(), {
    isWorkspaceSyncStateReady: true,
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
    isWorkspaceSyncStateReady: true,
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

function testPdfPlaceholderUsesOriginalSurface() {
  renderSurface(createPdfSurface('# Scanned PDF\n\nLinked PDF source ready for the reader surface.'));

  expect(screen.getByText('PDF original viewer')).toBeInTheDocument();
  expect(screen.queryByText('Text version')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Text' })).not.toBeInTheDocument();
}

function testPdfWithoutBodyUsesOriginalSurface() {
  renderSurface(createPdfSurface('', 'empty'));

  expect(screen.getByText('PDF original viewer')).toBeInTheDocument();
  expect(screen.queryByText('This topic has no body yet.')).not.toBeInTheDocument();
}

async function testOriginalPdfAttachmentSync() {
  const pullFromDesktop = vi.fn(async () => undefined);
  renderSurface(createPdfSurface(''), createWorkspaceSync({
    pullFromDesktop,
    state: { endpoint_url: 'http://10.0.2.2:38641', remembered_targets: [] }
  }));

  fireEvent.click(screen.getByRole('button', { name: 'Load PDF attachment' }));

  await waitFor(() => expect(syncObjectMock.saveCompanionSyncActiveViewState).toHaveBeenCalledWith('topic-1'));
  expect(attachmentSyncMock.syncCompanionAttachmentResourceFromDesktop).toHaveBeenCalledWith(
    'http://10.0.2.2:38641',
    'pdf-attachment-1'
  );
  await waitFor(() => expect(pullFromDesktop).toHaveBeenCalledWith('http://10.0.2.2:38641'));
}

describe('CompanionShellContent PDF articles', () => {
  it('keeps extracted PDF text as the primary mobile reading surface', testPrimaryPdfReadingSurface);
  it('opens the original PDF when the synced body is only a PDF placeholder', testPdfPlaceholderUsesOriginalSurface);
  it('opens the original PDF when no text body exists', testPdfWithoutBodyUsesOriginalSurface);
  it('syncs a missing inline attachment from the current topic surface', testInlineAttachmentSync);
  it('syncs a missing inline attachment against the latest topic after switching', testInlineAttachmentSyncUsesLatestTopic);
  it('syncs the original PDF attachment on demand', testOriginalPdfAttachmentSync);
});
