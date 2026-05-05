import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('../../shared/platform/bridge', () => ({
  getRuntimeInvoke: vi.fn()
}));

import { getRuntimeInvoke } from '../../shared/platform/bridge';

import { SearchPalette } from './SearchPalette';

it('loads search results from runtime without renderer content mirrors', async () => {
  const invoke = vi.fn().mockImplementation((command: string) => {
    if (command === 'search_workspace') {
      return Promise.resolve([
        {
          id: 'node-2',
          title: 'Atlas note',
          excerpt: '...launch checklist...',
          kind: 'node',
          nodeMatch: {
            from: 12,
            query: 'launch',
            to: 18
          },
          pdfMatch: null,
          updatedAt: '2026-03-30T00:00:00.000Z'
        }
      ]);
    }
    return Promise.resolve(null);
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  render(
    <SearchPalette
      isOpen
      nodeOrder={['node-1', 'node-2']}
      nodesById={{
        'node-1': {
          id: 'node-1',
          parentNodeId: null,
          title: 'Home',
          hasContent: false,
          hasReveal: false,
          review: null,
          createdAt: '2026-03-29T00:00:00.000Z',
          updatedAt: '2026-03-29T00:00:00.000Z'
        },
        'node-2': {
          id: 'node-2',
          parentNodeId: null,
          title: 'Atlas note',
          hasContent: true,
          hasReveal: false,
          review: null,
          createdAt: '2026-03-29T00:00:00.000Z',
          updatedAt: '2026-03-29T00:00:00.000Z'
        }
      }}
      onClose={() => undefined}
      onOpenResult={() => undefined}
      trashedNodeIds={[]}
    />
  );

  fireEvent.change(screen.getByRole('textbox', { name: 'Search workspace' }), {
    target: { value: 'launch' }
  });

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Atlas note/i })).toBeInTheDocument();
  });
  expect(screen.getByText('...launch checklist...')).toBeInTheDocument();
  expect(invoke).toHaveBeenCalledWith('search_workspace', { query: 'launch' });
});
