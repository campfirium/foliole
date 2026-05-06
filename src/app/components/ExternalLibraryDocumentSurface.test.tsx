import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { useWorkspaceStore } from '../../store/workspaceStore';

import { ExternalLibraryDocumentSurface } from './ExternalLibraryDocumentSurface';

const loadRuntimeExternalSearchPreview = vi.fn();
const importExternalDocument = vi.fn();

vi.mock('../../shared/platform/externalDocumentPreviewRepository', () => ({
  loadExternalDocumentPreview: (absolutePath: string) => loadRuntimeExternalSearchPreview(absolutePath)
}));

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
  loadRuntimeExternalSearchPreview.mockReset();
});

function renderDocumentSurface(
  selection: Parameters<typeof ExternalLibraryDocumentSurface>[0]['selection']
) {
  return render(
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
      selection={selection}
    />
  );
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
      selection={{ folderId: 'folder-1', kind: 'folder' }}
    />
  );

  expect(screen.getByRole('searchbox', { name: 'Search folder contents' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sort list by Last opened' })).toBeInTheDocument();
  expect(screen.getByTestId('folder-list-count')).toHaveTextContent('2');
  expect(screen.getByTestId('folder-list-title-/library/test 6/one.md')).toHaveTextContent('First title');
  expect(screen.getByTestId('folder-list-excerpt-/library/test 6/one.md')).toHaveTextContent('First opening preview from cache.');
  expect(screen.getByTestId('folder-list-date-/library/test 6/one.md')).toHaveTextContent('Never opened');

  fireEvent.click(screen.getByRole('button', { name: 'Open First title' }));

  expect(onOpenSelection).toHaveBeenCalledWith({
    absolutePath: '/library/test 6/one.md',
    folderId: 'folder-1',
    kind: 'document'
  });
});

it('shows a loading state while an external library document is loading', () => {
  loadRuntimeExternalSearchPreview.mockReturnValueOnce(new Promise(() => undefined));

  renderDocumentSurface({
    absolutePath: '/library/test 6/one.md',
    folderId: 'folder-1',
    kind: 'document'
  });

  expect(screen.getByText('Loading document')).toBeInTheDocument();
  expect(screen.getByText('Loading the selected external document.')).toBeInTheDocument();
});

it('shows an alert and retries when an external library document fails to load', async () => {
  loadRuntimeExternalSearchPreview
    .mockRejectedValueOnce(new Error('External document missing.'))
    .mockReturnValueOnce(new Promise(() => undefined));

  renderDocumentSurface({
    absolutePath: '/library/test 6/one.md',
    folderId: 'folder-1',
    kind: 'document'
  });

  expect(await screen.findByRole('alert')).toHaveTextContent('External document missing.');

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  await waitFor(() => {
    expect(loadRuntimeExternalSearchPreview).toHaveBeenCalledTimes(2);
  });
  expect(screen.getByText('Loading document')).toBeInTheDocument();
});

it('imports the external library preview and opens the imported topic', async () => {
  const rehydrate = vi.spyOn(useWorkspaceStore.persist, 'rehydrate').mockResolvedValue(undefined);
  importExternalDocument.mockResolvedValueOnce({
    imported_at: '2026-04-21T00:00:00.000Z',
    node_id: 'node-imported',
    source_name: 'one.md'
  });
  loadRuntimeExternalSearchPreview.mockResolvedValueOnce({
    absolutePath: '/library/test 6/one.md',
    content: '# One',
    extension: 'md',
    fileName: 'one.md',
    folderId: 'folder-1',
    folderPath: '/library/test 6',
    relativePath: 'one.md'
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
