import { fireEvent, screen, waitFor } from '@testing-library/react';
import React, { type ReactElement } from 'react';
import { expect, it, vi } from 'vitest';

import { DisplayScaleProvider } from '../../features/settings/context/DisplayScaleProvider';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

const mocks = vi.hoisted(() => ({
  markdownEditorMounted: vi.fn(),
  markdownEditorProps: vi.fn()
}));

vi.mock('../../features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: (props: { className?: string; liveMarkdownEnabled?: boolean; nodeId: string | null; onOpenExternalLink?: (request: { href: string }) => void; readOnly?: boolean }) => {
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

function renderPreview(ui: ReactElement) {
  return renderWithLocalization(<DisplayScaleProvider>{ui}</DisplayScaleProvider>);
}

function createLocalFileEditingProps() {
  return {
    content: '',
    flushSave: vi.fn(async () => true),
    handleChange: vi.fn(),
    isEditable: false,
    reloadFromDisk: vi.fn(async () => undefined),
    status: 'saved' as const
  };
}

it('opens the link panel when an external document preview link is clicked', async () => {
  renderPreview(
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
      localFileEditing={createLocalFileEditingProps()}
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
  expect(screen.getByRole('button', { name: 'Import to Foliole' })).toHaveClass('min-h-8', 'px-3', 'text-ui-md');
  expect(screen.getByRole('button', { name: 'Import to Foliole' })).toHaveTextContent('Import');
  expect(screen.getByRole('button', { name: 'Import to Foliole' }).closest('[data-testid="document-header-content-rail"]')).toBeInTheDocument();
  expect(screen.queryByText('/library/to sync/folder/topic.md')).not.toBeInTheDocument();
  expect(screen.queryByTestId('link-panel-count')).not.toBeInTheDocument();
  expect(mocks.markdownEditorProps).toHaveBeenCalledWith(expect.objectContaining({ nodeId: null, readOnly: true }));
  expect(mocks.markdownEditorProps).toHaveBeenCalledWith(expect.not.objectContaining({ liveMarkdownEnabled: false }));

  fireEvent.click(screen.getByRole('button', { name: 'Open external link' }));

  expect(await screen.findByTestId('link-panel-count')).toHaveTextContent('1');
});

it('keeps routine local-file save state out of the preview toolbar', () => {
  renderPreview(
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
      localFileEditing={{ ...createLocalFileEditingProps(), isEditable: true, status: 'saved' }}
      preview={{
        absolutePath: '/library/topic.md',
        content: '# Topic',
        editable: true,
        extension: 'md',
        fileName: 'topic.md',
        folderId: 'folder-1',
        folderPath: '/library',
        relativePath: 'topic.md',
        sourceKind: 'local_file'
      }}
    />
  );

  expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Import to Foliole' })).toHaveTextContent('Import');
  expect(mocks.markdownEditorProps).toHaveBeenCalledWith(expect.objectContaining({ readOnly: false }));
  expect(mocks.markdownEditorProps).toHaveBeenCalledWith(expect.not.objectContaining({ liveMarkdownEnabled: false }));
});

it('shows the Opened label for opened-file breadcrumbs even when cached rows still carry Local', () => {
  renderPreview(
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
      localFileEditing={createLocalFileEditingProps()}
      preview={{
        absolutePath: 'D:/T/test/topic.md',
        content: '# Topic',
        editable: true,
        extension: 'md',
        fileName: 'topic.md',
        folderId: 'opened-external-documents',
        folderPath: 'Local',
        relativePath: 'D:/T/test/topic.md',
        sourceKind: 'local_file'
      }}
    />
  );

  expect(screen.getByText('Opened')).toBeInTheDocument();
  expect(screen.queryByText('Local')).not.toBeInTheDocument();
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
    localFileEditing: createLocalFileEditingProps(),
    preview
  };
  const { rerender } = renderPreview(<ExternalLibraryPreviewSurface {...props} editorAppearanceKey="preview" />);

  await waitFor(() => expect(mocks.markdownEditorMounted).toHaveBeenCalledTimes(1));

  rerender(
    <DisplayScaleProvider>
      <ExternalLibraryPreviewSurface {...props} editorAppearanceKey="source" />
    </DisplayScaleProvider>
  );

  await waitFor(() => expect(mocks.markdownEditorMounted).toHaveBeenCalledTimes(2));
});
