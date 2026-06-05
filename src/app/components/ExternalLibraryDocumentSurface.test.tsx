import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { ExternalLibraryDocumentSurface } from './ExternalLibraryDocumentSurface';
import {
  createExternalPreviewState,
  externalDocumentSurfaceEntries,
  externalDocumentSurfaceFolders
} from './ExternalLibraryDocumentSurface.testSupport';

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

beforeEach(() => {
  importExternalDocument.mockReset();
});

it('renders the external folder contents in the center document area using the folder list view', () => {
  const onOpenSelection = vi.fn();
  const onGoBack = vi.fn();
  const onGoForward = vi.fn();

  renderWithLocalization(
    <ExternalLibraryDocumentSurface
      canGoBack
      canGoForward
      documentMaxWidth={760}
      editorAppearanceKey="preview"
      entriesByFolderId={externalDocumentSurfaceEntries}
      folders={externalDocumentSurfaceFolders}
      onGoBack={onGoBack}
      onGoForward={onGoForward}
      onOpenImportedNode={vi.fn()}
      onOpenSelection={onOpenSelection}
      onPreviewEditorReady={vi.fn()}
      previewState={createExternalPreviewState()}
      selection={{ folderId: 'folder-1', kind: 'folder' }}
    />
  );

  expect(screen.getByRole('searchbox', { name: 'Search folder contents' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sort list by Date modified' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
  fireEvent.click(screen.getByRole('button', { name: 'Go forward' }));
  expect(onGoBack).toHaveBeenCalledTimes(1);
  expect(onGoForward).toHaveBeenCalledTimes(1);
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
  renderWithLocalization(
    <ExternalLibraryDocumentSurface
      canGoBack={false}
      canGoForward={false}
      documentMaxWidth={760}
      editorAppearanceKey="preview"
      entriesByFolderId={externalDocumentSurfaceEntries}
      folders={externalDocumentSurfaceFolders}
      onGoBack={vi.fn()}
      onGoForward={vi.fn()}
      onOpenImportedNode={vi.fn()}
      onOpenSelection={vi.fn()}
      onPreviewEditorReady={vi.fn()}
      previewState={createExternalPreviewState({ isLoading: true })}
      selection={{
        absolutePath: '/library/test 6/one.md',
        folderId: 'folder-1',
        kind: 'document'
      }}
    />
  );

  expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  expect(screen.queryByText('Preparing document')).toBeNull();
});

it('shows an alert and retries when an external library document fails to load', async () => {
  const retry = vi.fn();

  renderWithLocalization(
    <ExternalLibraryDocumentSurface
      canGoBack={false}
      canGoForward={false}
      documentMaxWidth={760}
      editorAppearanceKey="preview"
      entriesByFolderId={externalDocumentSurfaceEntries}
      folders={externalDocumentSurfaceFolders}
      onGoBack={vi.fn()}
      onGoForward={vi.fn()}
      onOpenImportedNode={vi.fn()}
      onOpenSelection={vi.fn()}
      onPreviewEditorReady={vi.fn()}
      previewState={createExternalPreviewState({ error: 'External document missing.', retry })}
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

  renderWithLocalization(
    <ExternalLibraryDocumentSurface
      canGoBack={false}
      canGoForward={false}
      documentMaxWidth={760}
      editorAppearanceKey="preview"
      entriesByFolderId={externalDocumentSurfaceEntries}
      folders={externalDocumentSurfaceFolders}
      onGoBack={vi.fn()}
      onGoForward={vi.fn()}
      onOpenImportedNode={onOpenImportedNode}
      onOpenSelection={vi.fn()}
      onPreviewEditorReady={vi.fn()}
      previewState={createExternalPreviewState({
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
