import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeAll, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';
import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';

import { SearchResultPreviewPanel } from './SearchResultPreviewPanel';
import type { WorkspaceSearchResult } from './workspaceSearch';

vi.mock('../../shared/platform/runtimeInvoke', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../shared/platform/runtimeInvoke')>(),
  getRuntimeInvoke: vi.fn()
}));

vi.mock('../../features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: (props: { readOnly: boolean; value: string }) => <textarea readOnly={props.readOnly} value={props.value} />
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

it('loads the full body of an unloaded trashed result into the read-only preview', async () => {
  const initial = createInitialWorkspaceState();
  const result = { ...createResult(), id: 'trashed-preview-topic', isTrashed: true };
  const node = { ...initial.nodesById['node-1']!, id: result.id, content: '', hasContent: true, deletedAt: result.updatedAt };
  useWorkspaceStore.setState({
    ...initial,
    nodesById: { ...initial.nodesById, [node.id]: node },
    trashedNodeIds: [node.id]
  });
  const body = '# Complete topic\n\nThe matching passage and the rest of the body.';
  const invoke = vi.fn().mockResolvedValue({
    content: body, hideTitleHeading: false, kind: 'topic', reveal: null, virtualFilter: null
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  try {
    renderWithLocalization(
      <SearchResultPreviewPanel nodesById={{ [node.id]: node }} onClose={vi.fn()} onOpenResult={vi.fn()} result={result} />
    );

    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(body));
    expect(invoke).toHaveBeenCalledWith('load_node_document', { nodeId: node.id });
    expect(screen.getByRole('textbox')).toHaveProperty('readOnly', true);
    expect(useWorkspaceStore.getState().activeNodeId).toBe(initial.activeNodeId);
  } finally {
    vi.mocked(getRuntimeInvoke).mockReset();
    useWorkspaceStore.setState(initial);
  }
});

it('offers read-only preview controls for a trashed result', () => {
  renderWithLocalization(
    <SearchResultPreviewPanel
      nodesById={{ 'topic-1': { content: '# Search Topic' } } as never}
      onClose={vi.fn()}
      onOpenResult={vi.fn()}
      result={{ ...createResult(), isTrashed: true }}
    />
  );

  expect(screen.getByRole('button', { name: 'Full screen preview' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument();
});
