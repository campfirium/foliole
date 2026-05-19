import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { dispatchReadwiseOriginalFileWidgetAction } from '../../shared/platform/readwiseOriginalFileWidgetEvents';
import { useWorkspaceStore } from '../../store/workspaceStore';

const {
  loadRuntimeReadwiseBookEpub,
  loadRuntimeReadwiseBooksInventory,
  onRuntimeReadwiseBookEpubProgress,
  openRuntimeReadwiseBookDownload
} = vi.hoisted(() => ({
  loadRuntimeReadwiseBookEpub: vi.fn(),
  loadRuntimeReadwiseBooksInventory: vi.fn(),
  onRuntimeReadwiseBookEpubProgress: vi.fn(),
  openRuntimeReadwiseBookDownload: vi.fn()
}));

vi.mock('../../shared/platform/readwiseBooksRuntimeRepository', () => ({
  loadRuntimeReadwiseBookEpub,
  loadRuntimeReadwiseBooksInventory,
  onRuntimeReadwiseBookEpubProgress,
  openRuntimeReadwiseBookDownload
}));

import { ReadwiseBookActionsPanel } from './ReadwiseBookActionsPanel';

function seedDefaultRuntime() {
  loadRuntimeReadwiseBooksInventory.mockResolvedValue({ books: [], scannedAt: '2026-04-03T00:00:00.000Z' });
  openRuntimeReadwiseBookDownload.mockResolvedValue({ book_key: 'book-1', status: 'opened', title: 'Book One' });
  loadRuntimeReadwiseBookEpub.mockResolvedValue({
    book_key: 'book-1',
    epub_path: '/tmp/book-1.epub',
    status: 'selected',
    title: 'Book One'
  });
  onRuntimeReadwiseBookEpubProgress.mockReturnValue(() => undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(useWorkspaceStore.persist, 'rehydrate').mockResolvedValue();
  seedDefaultRuntime();
});

describe('ReadwiseBookActionsPanel bridge', () => {
  it('keeps the editor body mounted and runs download actions from the editor attachment', async () => {
    render(
      <ReadwiseBookActionsPanel activeContent="" activeNodeId="node-book-1">
        <div>Editor body</div>
      </ReadwiseBookActionsPanel>
    );

    dispatchReadwiseOriginalFileWidgetAction({ action: 'download', nodeId: 'node-book-1' });

    await waitFor(() => expect(openRuntimeReadwiseBookDownload).toHaveBeenCalledWith('node-book-1'));
  });

  it('loads the original file from the editor attachment action', async () => {
    render(<ReadwiseBookActionsPanel activeContent="" activeNodeId="node-book-1" />);

    dispatchReadwiseOriginalFileWidgetAction({ action: 'load', nodeId: 'node-book-1' });

    await waitFor(() => expect(loadRuntimeReadwiseBookEpub).toHaveBeenCalledWith('node-book-1'));
    expect(useWorkspaceStore.persist.rehydrate).toHaveBeenCalledTimes(1);
  });
});
