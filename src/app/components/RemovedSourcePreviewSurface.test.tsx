import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

const mocks = vi.hoisted(() => ({
  markdownEditorMounted: vi.fn(),
  restoreRuntimeRemovedSource: vi.fn()
}));

vi.mock('../../shared/platform/removedSourcesRuntimeRepository', () => ({
  restoreRuntimeRemovedSource: mocks.restoreRuntimeRemovedSource
}));

vi.mock('./DocumentPanelHeader', () => ({
  DocumentPanelHeader: ({ activeNodeId }: { activeNodeId: string }) => (
    <div aria-label="preview header">{activeNodeId}</div>
  )
}));

vi.mock('../../features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: ({ value }: { value: string }) => {
    React.useEffect(() => {
      mocks.markdownEditorMounted();
    }, []);
    return <article>{value}</article>;
  }
}));

import { RemovedSourcePreviewSurface } from './RemovedSourcePreviewSurface';
import { setSelectedRemovedSource } from './removedSourceSelectionStore';

function createRemovedSource() {
  return {
    content: '# Alpha Removed\n\nFull source text',
    contentPreview: 'Preview text',
    deletedAt: '2026-05-12T00:00:00.000Z',
    firstSeenAt: '2026-05-12T00:00:00.000Z',
    hasSourceUpdate: false,
    id: 'rule-1:/Readwise/Alpha.md',
    lastImportedAt: '2026-05-12T00:00:00.000Z',
    lastNodeId: 'topic-old',
    ruleId: 'rule-1',
    sourcePath: '/Readwise/Alpha.md',
    title: 'Alpha Removed'
  };
}

beforeEach(() => {
  mocks.markdownEditorMounted.mockReset();
  mocks.restoreRuntimeRemovedSource.mockReset();
  setSelectedRemovedSource(null);
});

it('renders Removed selection as an external-document style preview with Re-import inside the document', async () => {
  const onSelectNode = vi.fn();
  const entry = createRemovedSource();
  mocks.restoreRuntimeRemovedSource.mockResolvedValue({ node_id: 'topic-new', status: 'restored' });
  setSelectedRemovedSource(entry);

  renderWithLocalization(
    <RemovedSourcePreviewSurface
      canGoBack={false}
      canGoForward={false}
      documentMaxWidth={720}
      editorAppearanceKey="preview"
      onGoBack={vi.fn()}
      onGoForward={vi.fn()}
      onSelectNode={onSelectNode}
    />
  );

  expect(screen.getByRole('region', { name: 'Document area' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Re-import' })).toBeInTheDocument();
  expect(screen.getByText(/Alpha Removed/)).toBeInTheDocument();
  expect(screen.getByText(/Full source text/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Re-import' }));

  await waitFor(() => expect(mocks.restoreRuntimeRemovedSource).toHaveBeenCalledWith(entry));
  expect(onSelectNode).toHaveBeenCalledWith('topic-new');
});

it('remounts the removed preview editor when editor appearance changes', () => {
  const entry = createRemovedSource();
  setSelectedRemovedSource(entry);

  const { rerender } = renderWithLocalization(
    <RemovedSourcePreviewSurface
      canGoBack={false}
      canGoForward={false}
      documentMaxWidth={720}
      editorAppearanceKey="preview"
      onGoBack={vi.fn()}
      onGoForward={vi.fn()}
      onSelectNode={vi.fn()}
    />
  );

  expect(mocks.markdownEditorMounted).toHaveBeenCalledTimes(1);

  rerender(
    <RemovedSourcePreviewSurface
      canGoBack={false}
      canGoForward={false}
      documentMaxWidth={720}
      editorAppearanceKey="source"
      onGoBack={vi.fn()}
      onGoForward={vi.fn()}
      onSelectNode={vi.fn()}
    />
  );

  expect(mocks.markdownEditorMounted).toHaveBeenCalledTimes(2);
});
