import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { ExternalLibraryDocumentSurface } from './ExternalLibraryDocumentSurface';

vi.mock('../../features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: (props: { value: string }) => <div>{props.value}</div>
}));

vi.mock('./DocumentPanelHeader', () => ({
  DocumentPanelHeader: () => <div data-testid="document-panel-header" />
}));

it('opens imported external folder documents in the external preview first', () => {
  const onOpenImportedNodeId = vi.fn();
  const onOpenSelection = vi.fn();

  renderWithLocalization(
    <ExternalLibraryDocumentSurface
      canGoBack={false}
      canGoForward={false}
      documentMaxWidth={760}
      editorAppearanceKey="preview"
      entriesByFolderId={{
        'folder-1': [
          {
            absolutePath: '/library/test 6/one.md',
            extension: 'md',
            fileName: 'one.md',
            folderId: 'folder-1',
            folderPath: '/library/test 6',
            importedNodeId: 'node-imported',
            modifiedAt: '2026-04-19T00:00:00.000Z',
            openingText: 'First opening preview from cache.',
            relativePath: 'one.md',
            title: 'First title'
          }
        ]
      }}
      folders={[{
        attachmentMode: 'document_relative_first_then_fixed_root',
        attachmentRootPath: null,
        createdAt: '2026-04-21T00:00:00.000Z',
        documentCount: 1,
        excludedDirs: [],
        folderPath: '/library/test 6',
        id: 'folder-1',
        indexedAt: '2026-04-21T00:00:00.000Z',
        lastError: null,
        status: 'ready',
        updatedAt: '2026-04-21T00:00:00.000Z'
      }]}
      onGoBack={vi.fn()}
      onGoForward={vi.fn()}
      onOpenImportedNode={vi.fn()}
      onOpenImportedNodeId={onOpenImportedNodeId}
      onOpenSelection={onOpenSelection}
      onPreviewEditorReady={vi.fn()}
      previewState={{ error: null, isLoading: false, preview: null, retry: vi.fn() }}
      selection={{ folderId: 'folder-1', kind: 'folder' }}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'Open First title' }));

  expect(onOpenSelection).toHaveBeenCalledWith({
    absolutePath: '/library/test 6/one.md',
    folderId: 'folder-1',
    kind: 'document'
  });
  expect(onOpenImportedNodeId).not.toHaveBeenCalled();
});

it('opens an imported external preview from the Imported action', () => {
  const onOpenImportedNodeId = vi.fn();
  const onOpenSelection = vi.fn();

  renderWithLocalization(
    <ExternalLibraryDocumentSurface
      canGoBack={false}
      canGoForward={false}
      documentMaxWidth={760}
      editorAppearanceKey="preview"
      entriesByFolderId={{ 'folder-1': [] }}
      folders={[]}
      onGoBack={vi.fn()}
      onGoForward={vi.fn()}
      onOpenImportedNode={vi.fn()}
      onOpenImportedNodeId={onOpenImportedNodeId}
      onOpenSelection={onOpenSelection}
      onPreviewEditorReady={vi.fn()}
      previewState={{
        error: null,
        isLoading: false,
        preview: {
          absolutePath: '/library/test 6/one.md',
          content: '# One',
          extension: 'md',
          fileName: 'one.md',
          folderId: 'folder-1',
          folderPath: '/library/test 6',
          importedNodeId: 'node-imported',
          relativePath: 'one.md'
        },
        retry: vi.fn()
      }}
      selection={{ absolutePath: '/library/test 6/one.md', folderId: 'folder-1', kind: 'document' }}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'Open imported Topic' }));

  expect(screen.getByText('Imported')).toBeInTheDocument();
  expect(onOpenImportedNodeId).toHaveBeenCalledWith('node-imported');
  expect(onOpenSelection).not.toHaveBeenCalled();
});
