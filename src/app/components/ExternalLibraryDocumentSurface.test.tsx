import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { useWorkspaceStore } from '../../store/workspaceStore';

import { ExternalLibraryDocumentSurface } from './ExternalLibraryDocumentSurface';
import type { ExternalDocumentPreviewLoadState } from './externalSearchPreviewState';

const importExternalDocument = vi.fn();

vi.mock('../../shared/platform/externalDocumentImportRepository', () => ({
  importExternalDocument: (absolutePath: string) => importExternalDocument(absolutePath)
}));

vi.mock('../../features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: (props: { value: string }) => <div>{props.value}</div>
}));

vi.mock('./ExternalLibraryPreviewSurface', () => ({
  ExternalLibraryPreviewSurface: (props: { onHandleImport: () => void; preview: { content: string } }) => (
    <div>
      <div>{props.preview.content}</div>
      <button onClick={props.onHandleImport} type="button">
        Import to Foliole
      </button>
    </div>
  )
}));

const folders = [
  {
    attachmentMode: 'document_relative_first_then_fixed_root' as const,
    attachmentRootPath: null,
    createdAt: '2026-04-21T00:00:00.000Z',
    documentCount: 2,
    excludedDirs: [],
    folderPath: '/library/test 6',
    id: 'folder-1',
    indexedAt: '2026-04-21T00:00:00.000Z',
    lastError: null,
    status: 'ready' as const,
    updatedAt: '2026-04-21T00:00:00.000Z'
  }
];

const entriesByFolderId = {
  'folder-1': [
    {
      absolutePath: '/library/test 6/one.md',
      extension: 'md' as const,
      fileName: 'one.md',
      folderId: 'folder-1',
      folderPath: '/library/test 6',
      modifiedAt: '2026-04-19T00:00:00.000Z',
      openingText: 'First opening preview from cache.',
      relativePath: 'one.md',
      title: 'First title'
    },
    {
      absolutePath: '/library/test 6/two.md',
      extension: 'md' as const,
      fileName: 'two.md',
      folderId: 'folder-1',
      folderPath: '/library/test 6',
      modifiedAt: '2026-04-17T00:00:00.000Z',
      openingText: 'Second opening preview from cache.',
      relativePath: 'two.md',
      title: 'Second title'
    }
  ]
};

beforeEach(() => {
  importExternalDocument.mockReset();
});

function createPreviewState(
  overrides: Partial<ExternalDocumentPreviewLoadState> = {}
): ExternalDocumentPreviewLoadState {
  return {
    error: null,
    isLoading: false,
    preview: null,
    retry: vi.fn(),
    ...overrides
  };
}

it('renders the external folder contents in the center document area using the folder list view', () => {
  const onOpenSelection = vi.fn();

  render(
    <ExternalLibraryDocumentSurface
      canGoBack={false}
      canGoForward={false}
      documentMaxWidth={760}
      entriesByFolderId={entriesByFolderId}
      folders={folders}
      onGoBack={vi.fn()}
      onGoForward={vi.fn()}
      onOpenImportedNode={vi.fn()}
      onOpenSelection={onOpenSelection}
      onPreviewEditorReady={vi.fn()}
      previewState={createPreviewState()}
      selection={{ folderId: 'folder-1', kind: 'folder' }}
    />
  );

  expect(screen.getByRole('searchbox', { name: 'Search folder contents' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sort list by Date modified' })).toBeInTheDocument();
  expect(screen.getByTestId('folder-list-count')).toHaveTextContent('2');
  expect(screen.getByTestId('folder-list-title-/library/test 6/one.md')).toHaveTextContent('First title');
  expect(screen.getByTestId('folder-list-excerpt-/library/test 6/one.md')).toHaveTextContent('First opening preview from cache.');
  expect(screen.getByTestId('folder-list-date-/library/test 6/one.md')).toHaveTextContent('2026-04-19');

  fireEvent.click(screen.getByRole('button', { name: 'Open First title' }));

  expect(onOpenSelection).toHaveBeenCalledWith({
    absolutePath: '/library/test 6/one.md',
    folderId: 'folder-1',
    kind: 'document'
  });
});

it('shows a loading state while an external library document is loading', () => {
  render(
    <ExternalLibraryDocumentSurface
      canGoBack={false}
      canGoForward={false}
      documentMaxWidth={760}
      entriesByFolderId={entriesByFolderId}
      folders={folders}
      onGoBack={vi.fn()}
      onGoForward={vi.fn()}
      onOpenImportedNode={vi.fn()}
      onOpenSelection={vi.fn()}
      onPreviewEditorReady={vi.fn()}
      previewState={createPreviewState({ isLoading: true })}
      selection={{
        absolutePath: '/library/test 6/one.md',
        folderId: 'folder-1',
        kind: 'document'
      }}
    />
  );

  expect(screen.getByText('Loading document')).toBeInTheDocument();
  expect(screen.getByText('Loading the selected external document.')).toBeInTheDocument();
});

it('shows an alert and retries when an external library document fails to load', async () => {
  const retry = vi.fn();

  render(
    <ExternalLibraryDocumentSurface
      canGoBack={false}
      canGoForward={false}
      documentMaxWidth={760}
      entriesByFolderId={entriesByFolderId}
      folders={folders}
      onGoBack={vi.fn()}
      onGoForward={vi.fn()}
      onOpenImportedNode={vi.fn()}
      onOpenSelection={vi.fn()}
      onPreviewEditorReady={vi.fn()}
      previewState={createPreviewState({ error: 'External document missing.', retry })}
      selection={{
        absolutePath: '/library/test 6/one.md',
        folderId: 'folder-1',
        kind: 'document'
      }}
    />
  );

  expect(await screen.findByRole('alert')).toHaveTextContent('External document missing.');

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  expect(retry).toHaveBeenCalledTimes(1);
});

it('imports the external library preview and opens the imported topic', async () => {
  const rehydrate = vi.spyOn(useWorkspaceStore.persist, 'rehydrate').mockResolvedValue(undefined);
  importExternalDocument.mockResolvedValueOnce({
    imported_at: '2026-04-21T00:00:00.000Z',
    node_id: 'node-imported',
    source_name: 'one.md'
  });
  const onOpenImportedNode = vi.fn();

  render(
    <ExternalLibraryDocumentSurface
      canGoBack={false}
      canGoForward={false}
      documentMaxWidth={760}
      entriesByFolderId={entriesByFolderId}
      folders={folders}
      onGoBack={vi.fn()}
      onGoForward={vi.fn()}
      onOpenImportedNode={onOpenImportedNode}
      onOpenSelection={vi.fn()}
      onPreviewEditorReady={vi.fn()}
      previewState={createPreviewState({
        preview: {
          absolutePath: '/library/test 6/one.md',
          content: '# One',
          extension: 'md',
          fileName: 'one.md',
          folderId: 'folder-1',
          folderPath: '/library/test 6',
          relativePath: 'one.md'
        }
      })}
      selection={{
        absolutePath: '/library/test 6/one.md',
        folderId: 'folder-1',
        kind: 'document'
      }}
    />
  );

  await screen.findByText('# One');
  fireEvent.click(screen.getByRole('button', { name: 'Import to Foliole' }));

  await waitFor(() => {
    expect(importExternalDocument).toHaveBeenCalledWith('/library/test 6/one.md');
    expect(rehydrate).toHaveBeenCalledTimes(1);
    expect(onOpenImportedNode).toHaveBeenCalledWith({
      imported_at: '2026-04-21T00:00:00.000Z',
      node_id: 'node-imported',
      source_name: 'one.md'
    });
  });
  rehydrate.mockRestore();
});
