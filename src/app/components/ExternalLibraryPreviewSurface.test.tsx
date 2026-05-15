import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { ExternalLibraryPreviewSurface } from './ExternalLibraryPreviewSurface';

vi.mock('../../features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: (props: { className?: string; onOpenExternalLink?: (request: { href: string }) => void }) => (
    <div className={props.className} data-testid="external-preview-editor">
      <button onClick={() => props.onOpenExternalLink?.({ href: 'https://example.com/docs' })} type="button">
        Open external link
      </button>
    </div>
  )
}));

vi.mock('../../features/settings/context/AppearanceSettingsProvider', () => ({
  useAppearanceSettings: () => ({
    editorDisplayMode: 'preview' as const,
    toggleEditorDisplayMode: vi.fn()
  })
}));

vi.mock('./LinkPanelStack', () => ({
  LinkPanelStack: (props: { panels: Array<{ currentUrl: string }> }) => (
    <div data-testid="link-panel-count">{props.panels.length}</div>
  )
}));

it('opens the link panel when an external document preview link is clicked', () => {
  render(
    <ExternalLibraryPreviewSurface
      canGoBack={false}
      canGoForward={false}
      documentMaxWidth={760}
      isImporting={false}
      onGoBack={vi.fn()}
      onGoForward={vi.fn()}
      onHandleImport={vi.fn()}
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

  expect(screen.getByText('to sync')).toBeInTheDocument();
  expect(screen.getByText('folder')).toBeInTheDocument();
  expect(screen.getByTestId('external-preview-editor').parentElement).toHaveClass('pl-4', 'pt-2');
  expect(screen.getByTestId('document-header-content-rail')).toHaveClass('px-[var(--document-content-inline-padding)]');
  expect(screen.getByRole('button', { name: 'Import to Foliole' })).toHaveClass('translate-x-[calc(100%+theme(spacing.3))]');
  expect(screen.queryByText('/library/to sync/folder/topic.md')).not.toBeInTheDocument();
  expect(screen.getByTestId('link-panel-count')).toHaveTextContent('0');

  fireEvent.click(screen.getByRole('button', { name: 'Open external link' }));

  expect(screen.getByTestId('link-panel-count')).toHaveTextContent('1');
});
