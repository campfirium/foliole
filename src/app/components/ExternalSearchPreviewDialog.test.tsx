import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { ExternalSearchPreviewDialog } from './ExternalSearchPreviewDialog';

const loadRuntimeExternalSearchPreview = vi.fn();
const importExternalDocument = vi.fn();
const mocks = vi.hoisted(() => ({
  editorAppearanceKey: 'preview',
  markdownEditorMounted: vi.fn()
}));

vi.mock('../../shared/platform/externalDocumentPreviewRepository', () => ({
  loadExternalDocumentPreview: (absolutePath: string) => loadRuntimeExternalSearchPreview(absolutePath)
}));

vi.mock('../../shared/platform/externalDocumentImportRepository', () => ({
  importExternalDocument: (absolutePath: string) => importExternalDocument(absolutePath)
}));

vi.mock('../../features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: (props: { value: string }) => {
    React.useEffect(() => {
      mocks.markdownEditorMounted();
    }, []);
    return <div>{props.value}</div>;
  }
}));

vi.mock('../../features/settings/context/AppearanceSettingsProvider', () => ({
  useAppearanceSettings: () => ({ editorAppearanceKey: mocks.editorAppearanceKey })
}));

beforeEach(() => {
  mocks.editorAppearanceKey = 'preview';
  mocks.markdownEditorMounted.mockReset();
  importExternalDocument.mockReset();
  loadRuntimeExternalSearchPreview.mockReset();
});

it('shows a loading state while the external search preview loads', () => {
  loadRuntimeExternalSearchPreview.mockReturnValueOnce(new Promise(() => undefined));

  render(<ExternalSearchPreviewDialog absolutePath="/library/topic.md" onImportComplete={vi.fn()} onOpenChange={vi.fn()} />);

  expect(screen.getByText('Loading external preview')).toBeInTheDocument();
});

it('shows a retryable error when the external search preview fails', async () => {
  loadRuntimeExternalSearchPreview
    .mockRejectedValueOnce(new Error('Preview failed.'))
    .mockResolvedValueOnce({
      absolutePath: '/library/topic.md',
      content: '# Preview',
      extension: 'md',
      fileName: 'topic.md',
      folderId: 'folder-1',
      folderPath: '/library',
      relativePath: 'topic.md'
    });

  render(<ExternalSearchPreviewDialog absolutePath="/library/topic.md" onImportComplete={vi.fn()} onOpenChange={vi.fn()} />);

  expect(await screen.findByRole('alert')).toHaveTextContent('Preview failed.');

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  await waitFor(() => {
    expect(screen.getByText('# Preview')).toBeInTheDocument();
  });
});

it('remounts the external search preview editor when editor appearance changes', async () => {
  loadRuntimeExternalSearchPreview.mockResolvedValue({
    absolutePath: '/library/topic.md',
    content: '# Preview',
    extension: 'md',
    fileName: 'topic.md',
    folderId: 'folder-1',
    folderPath: '/library',
    relativePath: 'topic.md'
  });

  const { rerender } = render(<ExternalSearchPreviewDialog absolutePath="/library/topic.md" onImportComplete={vi.fn()} onOpenChange={vi.fn()} />);
  await screen.findByText('# Preview');
  expect(mocks.markdownEditorMounted).toHaveBeenCalledTimes(1);

  mocks.editorAppearanceKey = 'source';
  rerender(<ExternalSearchPreviewDialog absolutePath="/library/topic.md" onImportComplete={vi.fn()} onOpenChange={vi.fn()} />);

  expect(mocks.markdownEditorMounted).toHaveBeenCalledTimes(2);
});

it('imports the loaded external preview through the external document import ability', async () => {
  importExternalDocument.mockResolvedValueOnce({
    imported_at: '2026-04-21T00:00:00.000Z',
    node_id: 'node-imported',
    source_name: 'topic.md'
  });
  loadRuntimeExternalSearchPreview.mockResolvedValueOnce({
    absolutePath: '/library/topic.md',
    content: '# Preview',
    extension: 'md',
    fileName: 'topic.md',
    folderId: 'folder-1',
    folderPath: '/library',
    relativePath: 'topic.md'
  });
  const onImportComplete = vi.fn();

  render(<ExternalSearchPreviewDialog absolutePath="/library/topic.md" onImportComplete={onImportComplete} onOpenChange={vi.fn()} />);

  await screen.findByText('# Preview');
  fireEvent.click(screen.getByRole('button', { name: 'Import' }));

  await waitFor(() => {
    expect(importExternalDocument).toHaveBeenCalledWith('/library/topic.md');
    expect(onImportComplete).toHaveBeenCalledWith({
      imported_at: '2026-04-21T00:00:00.000Z',
      node_id: 'node-imported',
      source_name: 'topic.md'
    });
  });
});
