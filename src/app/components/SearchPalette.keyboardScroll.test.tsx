import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));
vi.mock('../../shared/platform/nodeSourceRuntimeRepository', () => ({
  loadRuntimeNodeSourceDetails: vi.fn()
}));
vi.mock('../../shared/platform/externalSearchRuntimeRepository', () => ({
  loadRuntimeExternalSearchFolders: vi.fn()
}));

import { loadRuntimeExternalSearchFolders } from '../../shared/platform/externalSearchRuntimeRepository';
import { loadRuntimeNodeSourceDetails } from '../../shared/platform/nodeSourceRuntimeRepository';
import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';

import { SearchPalette } from './SearchPalette';
import type { WorkspaceSearchResult } from './workspaceSearch';

const nodesById = Object.fromEntries(
  Array.from({ length: 8 }, (_, index) => [
    `node-${index}`,
    {
      id: `node-${index}`,
      parentNodeId: null,
      title: `Topic ${index}`,
      hasContent: true,
      hasReveal: false,
      review: null,
      createdAt: '2026-03-29T00:00:00.000Z',
      updatedAt: '2026-03-29T00:00:00.000Z'
    }
  ])
);

beforeEach(() => {
  vi.mocked(loadRuntimeNodeSourceDetails).mockResolvedValue(null);
  vi.mocked(loadRuntimeExternalSearchFolders).mockResolvedValue([]);
});

it('scrolls the active search result into view when keyboard navigation changes it', async () => {
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn().mockResolvedValue(createResults()));
  render(
    <SearchPalette
      isOpen
      nodeOrder={Object.keys(nodesById)}
      nodesById={nodesById}
      onClose={() => undefined}
      onOpenResult={() => undefined}
      trashedNodeIds={[]}
    />
  );

  const input = screen.getByRole('textbox', { name: 'Search workspace' });
  fireEvent.change(input, { target: { value: 'topic' } });
  await waitFor(() => expect(document.querySelector('[data-search-result-active="true"]')).toHaveTextContent('Topic 0'));
  scrollIntoView.mockClear();
  fireEvent.keyDown(input, { key: 'ArrowDown' });

  await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' }));
  expect(document.querySelector('[data-search-result-active="true"]')).toHaveTextContent('Topic 1');
});

function createResults(): WorkspaceSearchResult[] {
  return Object.keys(nodesById).map((id, index) => ({
    externalMatch: null,
    id,
    title: `Topic ${index}`,
    excerpt: `Topic ${index} body`,
    kind: 'node',
    nodeMatch: {
      from: 0,
      query: 'topic',
      to: 5
    },
    pdfMatch: null,
    updatedAt: '2026-03-30T00:00:00.000Z'
  }));
}
