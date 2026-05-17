import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';

import { useWorkspaceStore } from '../../store/workspaceStore';

import { ExternalDocumentPreviewPanel } from './ExternalDocumentPreviewPanel';

const loadRuntimeExternalSearchPreview = vi.fn();
const importExternalDocument = vi.fn();
const mocks = vi.hoisted(() => ({
  editorAppearanceKey: 'preview',
  markdownEditorMounted: vi.fn(),
  markdownEditorProps: vi.fn()
}));

vi.mock('../../shared/platform/externalDocumentPreviewRepository', () => ({
  loadExternalDocumentPreview: (absolutePath: string) => loadRuntimeExternalSearchPreview(absolutePath)
}));

vi.mock('../../shared/platform/externalDocumentImportRepository', () => ({
  importExternalDocument: (absolutePath: string) => importExternalDocument(absolutePath)
}));

vi.mock('../../features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: (props: { nodeId: string | null; readOnly?: boolean; value: string }) => {
    React.useEffect(() => {
      mocks.markdownEditorMounted();
    }, []);
    mocks.markdownEditorProps(props);
    return <div>{props.value}</div>;
  }
}));

vi.mock('../../features/settings/context/AppearanceSettingsProvider', () => ({
  useAppearanceSettings: () => ({ editorAppearanceKey: mocks.editorAppearanceKey })
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
  mocks.editorAppearanceKey = 'preview';
  mocks.markdownEditorMounted.mockReset();
  mocks.markdownEditorProps.mockReset();
  importExternalDocument.mockReset();
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
  expect(mocks.markdownEditorProps).toHaveBeenCalledWith(expect.objectContaining({ nodeId: null, readOnly: true }));
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

  expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  expect(screen.queryByText('Preparing document')).toBeNull();
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

it('imports the floating external preview and opens the imported topic', async () => {
  const rehydrate = vi.spyOn(useWorkspaceStore.persist, 'rehydrate').mockResolvedValue(undefined);
  importExternalDocument.mockResolvedValueOnce({
    imported_at: '2026-04-21T00:00:00.000Z',
    node_id: 'node-imported',
    source_name: 'topic.md'
  });
  loadRuntimeExternalSearchPreview.mockResolvedValueOnce({
    absolutePath: '/library/topic.md',
    content: '# Topic',
    extension: 'md',
    fileName: 'topic.md',
    folderId: 'folder-1',
    folderPath: '/library',
    relativePath: 'topic.md'
  });
  const onOpenImportedNode = vi.fn();

  render(
    <ExternalDocumentPreviewPanel
      onClose={vi.fn()}
      onOpenImportedNode={onOpenImportedNode}
      onOpenInExternalLibrary={vi.fn()}
      request={{
        absolutePath: '/library/topic.md',
        folderId: 'folder-1'
      }}
    />
  );

  await screen.findByText('# Topic');
  fireEvent.click(screen.getByRole('button', { name: 'Import' }));

  await waitFor(() => {
    expect(importExternalDocument).toHaveBeenCalledWith('/library/topic.md');
    expect(rehydrate).toHaveBeenCalledTimes(1);
    expect(onOpenImportedNode).toHaveBeenCalledWith({
      imported_at: '2026-04-21T00:00:00.000Z',
      node_id: 'node-imported',
      source_name: 'topic.md'
    });
  });
  rehydrate.mockRestore();
});
