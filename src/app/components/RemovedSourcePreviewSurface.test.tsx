import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
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
  MarkdownEditor: ({ value }: { value: string }) => <article>{value}</article>
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
  mocks.restoreRuntimeRemovedSource.mockReset();
  setSelectedRemovedSource(null);
});

it('renders Removed selection as an external-document style preview with Import inside the document', async () => {
  const onSelectNode = vi.fn();
  const entry = createRemovedSource();
  mocks.restoreRuntimeRemovedSource.mockResolvedValue({ node_id: 'topic-new', status: 'restored' });
  setSelectedRemovedSource(entry);

  render(
    <RemovedSourcePreviewSurface
      canGoBack={false}
      canGoForward={false}
      documentMaxWidth={720}
      onGoBack={vi.fn()}
      onGoForward={vi.fn()}
      onSelectNode={onSelectNode}
    />
  );

  expect(screen.getByRole('region', { name: 'Document area' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Import to Foliole' })).toBeInTheDocument();
  expect(screen.getByText(/Alpha Removed/)).toBeInTheDocument();
  expect(screen.getByText(/Full source text/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Import to Foliole' }));

  await waitFor(() => expect(mocks.restoreRuntimeRemovedSource).toHaveBeenCalledWith(entry));
  expect(onSelectNode).toHaveBeenCalledWith('topic-new');
});
