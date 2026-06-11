import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

const mocks = vi.hoisted(() => ({
  markdownEditorMounted: vi.fn(),
  markdownEditorProps: vi.fn()
}));

vi.mock('../../features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: (props: { className?: string; nodeId: string | null; onOpenExternalLink?: (request: { href: string }) => void }) => {
    React.useEffect(() => {
      mocks.markdownEditorMounted();
    }, []);
    mocks.markdownEditorProps(props);
    return (
      <div className={props.className} data-testid="external-preview-editor">
        <button onClick={() => props.onOpenExternalLink?.({ href: 'https://example.com/docs' })} type="button">
          Open external link
        </button>
      </div>
    );
  }
}));

vi.mock('../../features/settings/context/AppearanceSettingsProvider', () => ({
  useAppearanceSettings: () => ({
    editorDisplayMode: 'preview' as const,
    editorAppearanceKey: 'preview',
    toggleEditorDisplayMode: vi.fn()
  })
}));

vi.mock('./LinkPanelStack', () => ({
  LinkPanelStack: (props: { panels: Array<{ currentUrl: string }> }) => (
    <div data-testid="link-panel-count">{props.panels.length}</div>
  )
}));

const { ExternalLibraryPreviewSurface } = await import('./ExternalLibraryPreviewSurface');

it('opens the link panel when an external document preview link is clicked', async () => {
  renderWithLocalization(
    <ExternalLibraryPreviewSurface
      canGoBack={false}
      canGoForward={false}
      documentMaxWidth={760}
      editorAppearanceKey="preview"
      isImporting={false}
      onGoBack={vi.fn()}
      onGoForward={vi.fn()}
      onHandleImport={vi.fn()}
      onOpenImportedNodeId={vi.fn()}
      onOpenSelection={vi.fn()}
      onPreviewEditorReady={vi.fn()}
      preview={{
        absolutePath: '/library/topic.md',
        content: '[docs](https://example.com/docs)',
        extension: 'md',
        fileName: 'topic.md',
        folderId: 'folder-1',
        folderPath: '/library/to sync',
        relativePath: 'folder/topic.md'
      }}
    />
  );

  expect(await screen.findByText('to sync')).toBeInTheDocument();
  expect(screen.getByText('folder')).toBeInTheDocument();
  expect(screen.getByTestId('external-preview-editor').parentElement).toHaveClass('pl-4', 'pt-2');
  expect(screen.getByTestId('document-header-content-rail')).toHaveClass('px-[var(--document-content-inline-padding)]');
  expect(screen.getByRole('button', { name: 'Import to Foliole' })).toHaveClass('p-0', 'text-sm', 'leading-[1.25]');
  expect(screen.getByRole('button', { name: 'Import to Foliole' })).toHaveTextContent('Import');
  expect(screen.getByRole('button', { name: 'Import to Foliole' }).closest('[data-testid="document-header-content-rail"]')).toBeInTheDocument();
  expect(screen.queryByText('/library/to sync/folder/topic.md')).not.toBeInTheDocument();
  expect(screen.getByTestId('link-panel-count')).toHaveTextContent('0');
  expect(mocks.markdownEditorProps).toHaveBeenCalledWith(expect.objectContaining({ nodeId: null, readOnly: true }));

  fireEvent.click(screen.getByRole('button', { name: 'Open external link' }));

  expect(screen.getByTestId('link-panel-count')).toHaveTextContent('1');
});

it('shows the Opened label for opened-file breadcrumbs even when cached rows still carry Recent', () => {
  renderWithLocalization(
    <ExternalLibraryPreviewSurface
      canGoBack={false}
      canGoForward={false}
      documentMaxWidth={760}
      editorAppearanceKey="preview"
      isImporting={false}
      onGoBack={vi.fn()}
      onGoForward={vi.fn()}
      onHandleImport={vi.fn()}
      onOpenImportedNodeId={vi.fn()}
      onOpenSelection={vi.fn()}
      onPreviewEditorReady={vi.fn()}
      preview={{
        absolutePath: 'D:/T/test/topic.md',
        content: '# Topic',
        extension: 'md',
        fileName: 'topic.md',
        folderId: 'opened-external-documents',
        folderPath: 'Recent',
        relativePath: 'D:/T/test/topic.md'
      }}
    />
  );

  expect(screen.getByText('Opened')).toBeInTheDocument();
  expect(screen.queryByText('Recent')).not.toBeInTheDocument();
});

it('remounts the external library preview editor when editor appearance changes', async () => {
  mocks.markdownEditorMounted.mockReset();
  const preview = {
    absolutePath: '/library/topic.md',
    content: '# Topic',
    extension: 'md' as const,
    fileName: 'topic.md',
    folderId: 'folder-1',
    folderPath: '/library',
    relativePath: 'topic.md'
  };
  const props = {
    canGoBack: false,
    canGoForward: false,
    documentMaxWidth: 760,
    isImporting: false,
    onGoBack: vi.fn(),
    onGoForward: vi.fn(),
    onHandleImport: vi.fn(),
    onOpenImportedNodeId: vi.fn(),
    onOpenSelection: vi.fn(),
    onPreviewEditorReady: vi.fn(),
    preview
  };
  const { rerender } = renderWithLocalization(<ExternalLibraryPreviewSurface {...props} editorAppearanceKey="preview" />);

  await waitFor(() => expect(mocks.markdownEditorMounted).toHaveBeenCalledTimes(1));

  rerender(<ExternalLibraryPreviewSurface {...props} editorAppearanceKey="source" />);

  await waitFor(() => expect(mocks.markdownEditorMounted).toHaveBeenCalledTimes(2));
});
