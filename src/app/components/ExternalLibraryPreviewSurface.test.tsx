import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { ExternalLibraryPreviewSurface } from './ExternalLibraryPreviewSurface';

vi.mock('../../features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: (props: { onOpenExternalLink?: (request: { href: string }) => void }) => (
    <button onClick={() => props.onOpenExternalLink?.({ href: 'https://example.com/docs' })} type="button">
      Open external link
    </button>
  )
}));

vi.mock('./LinkPanelStack', () => ({
  LinkPanelStack: (props: { panels: Array<{ currentUrl: string }> }) => (
    <div data-testid="link-panel-count">{props.panels.length}</div>
  )
}));

it('opens the link panel when an external document preview link is clicked', () => {
  render(
    <ExternalLibraryPreviewSurface
      isImporting={false}
      onHandleImport={vi.fn()}
      preview={{
        absolutePath: '/library/topic.md',
        content: '[docs](https://example.com/docs)',
        extension: 'md',
        fileName: 'topic.md',
        folderId: 'folder-1',
        folderPath: '/library',
        relativePath: 'topic.md'
      }}
    />
  );

  expect(screen.getByTestId('link-panel-count')).toHaveTextContent('0');

  fireEvent.click(screen.getByRole('button', { name: 'Open external link' }));

  expect(screen.getByTestId('link-panel-count')).toHaveTextContent('1');
});
