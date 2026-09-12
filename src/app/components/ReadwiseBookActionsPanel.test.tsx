import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { dispatchReadwiseOriginalFileWidgetAction } from '../../shared/platform/readwiseOriginalFileWidgetEvents';
import { useWorkspaceStore } from '../../store/workspaceStore';

const {
  ensureWorkspaceNodeDocumentReady,
  loadRuntimeReadwiseBookEpub,
  loadRuntimeReadwiseBooksInventory,
  onRuntimeReadwiseBookEpubProgress,
  openRuntimeReadwiseBookDownload
} = vi.hoisted(() => ({
  ensureWorkspaceNodeDocumentReady: vi.fn(),
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
vi.mock('../../store/workspaceNodePreparation', () => ({
  ensureWorkspaceNodeDocumentReady
}));

import { EpubImportReleaseModeDialog } from './EpubImportReleaseModeDialog';
import { ReadwiseBookActionsPanel } from './ReadwiseBookActionsPanel';
import { READWISE_ORIGINAL_FILE_LOADED_EVENT } from './readwiseBookActionState';
import { ReadwiseBookDocumentGate } from './ReadwiseBookDocumentGate';

function createPendingBook() {
  return {
    annotationStatus: 'has_highlights' as const,
    bodyState: 'unloaded' as const,
    bookKey: 'book-1',
    epubPath: null,
    epubStatus: 'missing' as const,
    fullDocumentMarkdownPath: '/tmp/book-1.md',
    generatedNodeId: 'node-book-1',
    highlightMarkdownPath: '/tmp/book-1-highlights.md',
    highlightState: 'placed' as const,
    highlightUnmatchedCount: 0,
    importStatus: 'pending' as const,
    nodeStatus: 'generated' as const,
    title: 'Book One'
  };
}

const PLACEHOLDER_CONTENT = [
  '# Book One',
  '',
  'Full text of this document omitted because this document is an EPUB',
  '',
  '[Download original file →](https://readwise.io/reader/document_raw_content/1)'
].join('\n');

function seedDefaultRuntime() {
  loadRuntimeReadwiseBooksInventory.mockResolvedValue({
    books: [createPendingBook()],
    fullDocumentDirectoryPath: '/tmp/full',
    highlightDirectoryPath: '/tmp/highlights',
    scannedAt: '2026-04-03T00:00:00.000Z'
  });
  openRuntimeReadwiseBookDownload.mockResolvedValue({ book_key: 'book-1', status: 'opened', title: 'Book One' });
  loadRuntimeReadwiseBookEpub.mockResolvedValue({
    annotation_status: 'has_highlights',
    book_key: 'book-1',
    epub_path: '/tmp/book-1.epub',
    import_status: 'completed',
    status: 'selected',
    title: 'Book One'
  });
  ensureWorkspaceNodeDocumentReady.mockResolvedValue(null);
  onRuntimeReadwiseBookEpubProgress.mockReturnValue(() => undefined);
}

function renderActionsPanel() {
  return renderWithLocalization(
    <>
      <ReadwiseBookActionsPanel activeContent={PLACEHOLDER_CONTENT} activeNodeId="node-book-1" />
      <EpubImportReleaseModeDialog />
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(useWorkspaceStore.persist, 'rehydrate').mockResolvedValue();
  vi.spyOn(useWorkspaceStore.getState(), 'setNodeSequentialReading').mockReturnValue(true);
  seedDefaultRuntime();
});

describe('ReadwiseBookActionsPanel', () => {
  it('renders the original file panel while the file has not been loaded', async () => {
    renderWithLocalization(
      <ReadwiseBookActionsPanel activeContent={PLACEHOLDER_CONTENT} activeNodeId="node-book-1">
        <div>Editor body</div>
      </ReadwiseBookActionsPanel>
    );

    expect(await screen.findByText('Original file')).toBeInTheDocument();
    expect(screen.getByText('Editor body')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download original file' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load original file' })).toBeInTheDocument();
    expect(loadRuntimeReadwiseBooksInventory).not.toHaveBeenCalled();
  });

  it('keeps ordinary documents inert and only enables actions for placeholder content', async () => {
    const view = renderWithLocalization(
      <ReadwiseBookDocumentGate activeContent="# Ordinary topic" activeNodeId="node-ordinary-1">
        <div>Book placeholder body</div>
      </ReadwiseBookDocumentGate>
    );

    expect(await screen.findByText('Book placeholder body')).toBeInTheDocument();
    view.rerender(
      <ReadwiseBookDocumentGate activeContent="# Another ordinary topic" activeNodeId="node-ordinary-2">
        <div>Book placeholder body</div>
      </ReadwiseBookDocumentGate>
    );
    dispatchReadwiseOriginalFileWidgetAction({ action: 'download', nodeId: 'node-ordinary-2' });
    expect(loadRuntimeReadwiseBooksInventory).not.toHaveBeenCalled();
    expect(openRuntimeReadwiseBookDownload).not.toHaveBeenCalled();

    view.rerender(
      <ReadwiseBookDocumentGate activeContent={PLACEHOLDER_CONTENT} activeNodeId="node-book-1">
        <div>Book placeholder body</div>
      </ReadwiseBookDocumentGate>
    );
    expect(loadRuntimeReadwiseBooksInventory).not.toHaveBeenCalled();
    dispatchReadwiseOriginalFileWidgetAction({ action: 'download', nodeId: 'node-book-1' });
    await waitFor(() => expect(openRuntimeReadwiseBookDownload).toHaveBeenCalledWith('node-book-1'));
  });
});

describe('Readwise original file actions', () => {
  it('runs download actions from the panel', async () => {
    renderWithLocalization(<ReadwiseBookActionsPanel activeContent={PLACEHOLDER_CONTENT} activeNodeId="node-book-1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Download original file' }));

    await waitFor(() => expect(openRuntimeReadwiseBookDownload).toHaveBeenCalledWith('node-book-1'));
  });

  it('loads the original file and asks source details to refresh', async () => {
    const loadedListener = vi.fn();
    window.addEventListener(READWISE_ORIGINAL_FILE_LOADED_EVENT, loadedListener);

    renderActionsPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Load original file' }));
    await waitFor(() => expect(loadRuntimeReadwiseBookEpub).toHaveBeenCalledWith('node-book-1'));
    expect(await screen.findByRole('dialog', { name: 'Choose reading mode' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Free reading/ }));

    expect(useWorkspaceStore.persist.rehydrate).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(ensureWorkspaceNodeDocumentReady).toHaveBeenCalledWith('node-book-1', { forceLoad: true })
    );
    await waitFor(() =>
      expect(useWorkspaceStore.getState().setNodeSequentialReading).toHaveBeenCalledWith('node-book-1', false)
    );
    await waitFor(() => expect(loadedListener).toHaveBeenCalledTimes(1));
    window.removeEventListener(READWISE_ORIGINAL_FILE_LOADED_EVENT, loadedListener);
  });

  it('does not ask for a reading mode when native loading is cancelled', async () => {
    loadRuntimeReadwiseBookEpub.mockResolvedValue({
      book_key: 'book-1',
      epub_path: null,
      status: 'cancelled',
      title: 'Book One'
    });
    renderActionsPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Load original file' }));

    await waitFor(() => expect(screen.getByText('Load original file was cancelled.')).toBeInTheDocument());
    expect(screen.queryByRole('dialog', { name: 'Choose reading mode' })).not.toBeInTheDocument();
    expect(ensureWorkspaceNodeDocumentReady).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().setNodeSequentialReading).not.toHaveBeenCalled();
  });
});
