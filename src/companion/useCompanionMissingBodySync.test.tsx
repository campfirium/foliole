import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCompanionMissingBodySync } from './useCompanionMissingBodySync';

const desktopSyncMock = vi.hoisted(() => ({
  syncCompanionContentBlobFromDesktop: vi.fn(async () => ({ availability: 'cached', hash: 'hash' }))
}));
const syncObjectMock = vi.hoisted(() => ({
  saveCompanionSyncActiveViewState: vi.fn(async () => ({ content_hash: 'hash-active', object_id: 'active' }))
}));

vi.mock('../shared/platform/companionDesktopSyncObjects', () => desktopSyncMock);
vi.mock('../shared/platform/companionSyncObjects', () => syncObjectMock);

type MissingBodyArticle = Parameters<typeof useCompanionMissingBodySync>[0]['readableArticle'];

function createMissingArticle(nodeId = 'article-2'): MissingBodyArticle {
  return {
    bodyBlobHash: 'b'.repeat(64),
    bodyStatus: 'missing',
    content: '',
    hideTitleHeading: false,
    nodeId,
    pdfAttachmentId: null,
    textAnchorDecorations: [],
    title: 'Missing article'
  };
}

function createReadyArticle(): MissingBodyArticle {
  return {
    content: 'Ready',
    hideTitleHeading: false,
    nodeId: 'article-1',
    pdfAttachmentId: null,
    textAnchorDecorations: [],
    title: 'Ready article'
  };
}

function createWorkspaceSync() {
  return {
    pullFromDesktop: vi.fn(async () => undefined),
    refreshFromDevice: vi.fn(async () => undefined),
    status: 'idle',
    state: {
      endpoint_url: 'http://10.0.2.2:38641',
      remembered_targets: [],
      workspace_snapshot: {}
    }
  } as Parameters<typeof useCompanionMissingBodySync>[0]['workspaceSync'];
}

async function flushBodySync() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function expectMissingBodyRetryAfterReopen() {
  desktopSyncMock.syncCompanionContentBlobFromDesktop
    .mockRejectedValueOnce(new Error('Desktop returned 404.'))
    .mockResolvedValueOnce({ availability: 'cached', hash: 'hash' });
  const workspaceSync = createWorkspaceSync();
  const { rerender } = renderHook(
    (article: MissingBodyArticle) => useCompanionMissingBodySync({ readableArticle: article, workspaceSync }),
    { initialProps: createMissingArticle() }
  );

  await flushBodySync();
  rerender(createMissingArticle());
  await flushBodySync();
  expect(desktopSyncMock.syncCompanionContentBlobFromDesktop).toHaveBeenCalledTimes(1);

  rerender(createReadyArticle());
  rerender(createMissingArticle());
  await flushBodySync();

  expect(desktopSyncMock.syncCompanionContentBlobFromDesktop).toHaveBeenCalledTimes(2);
  expect(syncObjectMock.saveCompanionSyncActiveViewState).toHaveBeenCalledWith('article-2');
  expect(workspaceSync.refreshFromDevice).toHaveBeenCalledTimes(1);
  expect(workspaceSync.pullFromDesktop).toHaveBeenCalledTimes(1);
  expect(workspaceSync.pullFromDesktop).toHaveBeenCalledWith('http://10.0.2.2:38641');
}

async function expectNoNestedBackgroundSync() {
  const workspaceSync = { ...createWorkspaceSync(), status: 'syncing' as const };
  renderHook(() => useCompanionMissingBodySync({ readableArticle: createMissingArticle(), workspaceSync }));

  await flushBodySync();

  expect(workspaceSync.refreshFromDevice).toHaveBeenCalledTimes(1);
  expect(workspaceSync.pullFromDesktop).not.toHaveBeenCalled();
}

async function expectBodyFetchContinuesWhenActiveViewSaveFails() {
  syncObjectMock.saveCompanionSyncActiveViewState.mockRejectedValue(new Error('native write failed'));
  const workspaceSync = createWorkspaceSync();

  renderHook(() => useCompanionMissingBodySync({ readableArticle: createMissingArticle(), workspaceSync }));

  await flushBodySync();

  expect(desktopSyncMock.syncCompanionContentBlobFromDesktop).toHaveBeenCalledWith(
    'http://10.0.2.2:38641',
    'b'.repeat(64)
  );
}

describe('useCompanionMissingBodySync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    desktopSyncMock.syncCompanionContentBlobFromDesktop.mockResolvedValue({ availability: 'cached', hash: 'hash' });
    syncObjectMock.saveCompanionSyncActiveViewState.mockResolvedValue({ content_hash: 'hash-active', object_id: 'active' });
  });

  it('retries a missing body after leaving and reopening the article', expectMissingBodyRetryAfterReopen);

  it('does not start a background sync while the main sync is already running', expectNoNestedBackgroundSync);

  it('still tries to fetch the body when active view persistence fails', expectBodyFetchContinuesWhenActiveViewSaveFails);
});
