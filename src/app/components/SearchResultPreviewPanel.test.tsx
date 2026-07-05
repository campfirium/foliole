import { fireEvent, screen } from '@testing-library/react';
import { beforeAll, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { SearchResultPreviewPanel } from './SearchResultPreviewPanel';
import type { WorkspaceSearchResult } from './workspaceSearch';

vi.mock('../../features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: (props: { value: string }) => <textarea readOnly value={props.value} />
}));

vi.mock('../../features/settings/context/AppearanceSettingsProvider', () => ({
  useAppearanceSettings: () => ({ editorAppearanceKey: 'search-preview' })
}));

beforeAll(() => {
  class MockResizeObserver {
    disconnect() {}
    observe() {}
    unobserve() {}
  }

  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

function createResult(): WorkspaceSearchResult {
  return {
    excerpt: 'Search excerpt',
    externalMatch: null,
    id: 'topic-1',
    kind: 'node',
    nodeMatch: null,
    pdfMatch: null,
    title: 'Search Topic',
    updatedAt: '2026-07-05T00:00:00.000Z'
  };
}

it('renders the search result preview without close chrome', () => {
  renderWithLocalization(
    <SearchResultPreviewPanel
      nodesById={{ 'topic-1': { content: '# Search Topic' } } as never}
      onClose={vi.fn()}
      onOpenResult={vi.fn()}
      result={createResult()}
    />
  );

  expect(screen.getByRole('dialog', { name: 'Search result preview' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Full screen preview' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Close preview' })).not.toBeInTheDocument();
});

it('closes the search result preview on Escape, including fullscreen mode', () => {
  const onClose = vi.fn();
  renderWithLocalization(
    <SearchResultPreviewPanel
      nodesById={{ 'topic-1': { content: '# Search Topic' } } as never}
      onClose={onClose}
      onOpenResult={vi.fn()}
      result={createResult()}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'Full screen preview' }));
  fireEvent.keyDown(window, { key: 'Escape' });

  expect(onClose).toHaveBeenCalledTimes(1);
});
