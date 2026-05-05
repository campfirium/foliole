import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';

import { ExternalDocumentPreviewPanel } from './ExternalDocumentPreviewPanel';

const loadRuntimeExternalSearchPreview = vi.fn();

vi.mock('../../shared/platform/externalSearchRuntimeRepository', () => ({
  importRuntimeExternalSearchDocument: vi.fn(),
  loadRuntimeExternalSearchPreview: (absolutePath: string) => loadRuntimeExternalSearchPreview(absolutePath)
}));

vi.mock('../../features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: (props: { value: string }) => <div>{props.value}</div>
}));

vi.mock('./LinkPanelStack', () => ({
  LinkPanelStack: () => null
}));

beforeAll(() => {
  class MockResizeObserver {
    disconnect() {}
    observe() {}
    unobserve() {}
  }

  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

beforeEach(() => {
  loadRuntimeExternalSearchPreview.mockReset();
});

it('renders the external document preview panel as a floating window for a requested search hit', async () => {
  loadRuntimeExternalSearchPreview.mockResolvedValueOnce({
    absolutePath: '/library/topic.md',
    content: '# Topic',
    extension: 'md',
    fileName: 'topic.md',
    folderId: 'folder-1',
    folderPath: '/library',
    relativePath: 'topic.md'
  });
  const onOpenInExternalLibrary = vi.fn();

  render(
    <ExternalDocumentPreviewPanel
      onClose={vi.fn()}
      onOpenImportedNode={vi.fn()}
      onOpenInExternalLibrary={onOpenInExternalLibrary}
      request={{
        absolutePath: '/library/topic.md',
        folderId: 'folder-1'
      }}
    />
  );

  const overlay = screen.getByLabelText('External document preview panel');
  expect(overlay).toBeInTheDocument();

  await waitFor(() => {
    expect(screen.getByText('# Topic')).toBeInTheDocument();
  });
  const panel = overlay.querySelector('section');
  expect(panel).not.toBeNull();
  expect(panel?.style.width).toBeTruthy();
  expect(panel?.style.height).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Full screen preview' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Open in External library' }));

  expect(onOpenInExternalLibrary).toHaveBeenCalledWith({
    absolutePath: '/library/topic.md',
    folderId: 'folder-1'
  });
});

it('shows a loading state while the floating external preview is loading', () => {
  loadRuntimeExternalSearchPreview.mockReturnValueOnce(new Promise(() => undefined));

  render(
    <ExternalDocumentPreviewPanel
      onClose={vi.fn()}
      onOpenImportedNode={vi.fn()}
      onOpenInExternalLibrary={vi.fn()}
      request={{
        absolutePath: '/library/topic.md',
        folderId: 'folder-1'
      }}
    />
  );

  expect(screen.getByText('Loading external document')).toBeInTheDocument();
  expect(screen.getByText('Loading the selected external document.')).toBeInTheDocument();
});

it('shows an alert and retries when the floating external preview fails', async () => {
  loadRuntimeExternalSearchPreview
    .mockRejectedValueOnce(new Error('External disk unavailable.'))
    .mockResolvedValueOnce({
      absolutePath: '/library/topic.md',
      content: '# Topic after retry',
      extension: 'md',
      fileName: 'topic.md',
      folderId: 'folder-1',
      folderPath: '/library',
      relativePath: 'topic.md'
    });

  render(
    <ExternalDocumentPreviewPanel
      onClose={vi.fn()}
      onOpenImportedNode={vi.fn()}
      onOpenInExternalLibrary={vi.fn()}
      request={{
        absolutePath: '/library/topic.md',
        folderId: 'folder-1'
      }}
    />
  );

  expect(await screen.findByRole('alert')).toHaveTextContent('External disk unavailable.');

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  await waitFor(() => {
    expect(screen.getByText('# Topic after retry')).toBeInTheDocument();
  });
  expect(loadRuntimeExternalSearchPreview).toHaveBeenCalledTimes(2);
});

it('toggles the preview window into fullscreen mode', async () => {
  loadRuntimeExternalSearchPreview.mockResolvedValueOnce({
    absolutePath: '/library/topic.md',
    content: '# Topic',
    extension: 'md',
    fileName: 'topic.md',
    folderId: 'folder-1',
    folderPath: '/library',
    relativePath: 'topic.md'
  });

  render(
    <ExternalDocumentPreviewPanel
      onClose={vi.fn()}
      onOpenImportedNode={vi.fn()}
      onOpenInExternalLibrary={vi.fn()}
      request={{
        absolutePath: '/library/topic.md',
        folderId: 'folder-1'
      }}
    />
  );

  await waitFor(() => {
    expect(screen.getByText('# Topic')).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Full screen preview' }));

  expect(screen.getByRole('button', { name: 'Restore preview window' })).toBeInTheDocument();
});
