import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCompanionMissingBodySync } from './useCompanionMissingBodySync';

const desktopSyncMock = vi.hoisted(() => ({
  syncCompanionContentBlobFromDesktop: vi.fn(async () => ({ availability: 'cached', hash: 'hash' }))
}));

vi.mock('../shared/platform/companionDesktopSyncObjects', () => desktopSyncMock);

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

describe('useCompanionMissingBodySync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    desktopSyncMock.syncCompanionContentBlobFromDesktop.mockResolvedValue({ availability: 'cached', hash: 'hash' });
  });

  it('retries a missing body after leaving and reopening the article', async () => {
    desktopSyncMock.syncCompanionContentBlobFromDesktop
      .mockRejectedValueOnce(new Error('Desktop returned 404.'))
      .mockResolvedValueOnce({ availability: 'cached', hash: 'hash' });
    const workspaceSync = createWorkspaceSync();
    const { rerender } = renderHook(
      (article: MissingBodyArticle) => useCompanionMissingBodySync({ readableArticle: article, workspaceSync }),
      { initialProps: createMissingArticle() }
    );

    await act(async () => {
      await Promise.resolve();
    });
    rerender(createMissingArticle());
    await act(async () => {
      await Promise.resolve();
    });
    expect(desktopSyncMock.syncCompanionContentBlobFromDesktop).toHaveBeenCalledTimes(1);

    rerender(createReadyArticle());
    rerender(createMissingArticle());
    await act(async () => {
      await Promise.resolve();
    });

    expect(desktopSyncMock.syncCompanionContentBlobFromDesktop).toHaveBeenCalledTimes(2);
    expect(workspaceSync.refreshFromDevice).toHaveBeenCalledTimes(1);
    expect(workspaceSync.pullFromDesktop).toHaveBeenCalledTimes(1);
    expect(workspaceSync.pullFromDesktop).toHaveBeenCalledWith('http://10.0.2.2:38641');
  });

  it('does not start a background sync while the main sync is already running', async () => {
    const workspaceSync = { ...createWorkspaceSync(), status: 'syncing' as const };
    renderHook(() => useCompanionMissingBodySync({ readableArticle: createMissingArticle(), workspaceSync }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(workspaceSync.refreshFromDevice).toHaveBeenCalledTimes(1);
    expect(workspaceSync.pullFromDesktop).not.toHaveBeenCalled();
  });
});
