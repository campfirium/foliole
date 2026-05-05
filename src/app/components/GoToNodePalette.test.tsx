import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { GoToNodePalette } from './GoToNodePalette';

it('marks the go-to palette dialog as modal', () => {
  render(
    <GoToNodePalette
      isOpen
      nodeOrder={['node-1']}
      nodesById={{
        'node-1': {
          createdAt: '2026-04-26T00:00:00.000Z',
          hasContent: true,
          hasReveal: false,
          id: 'node-1',
          parentNodeId: null,
          review: null,
          title: 'Topic A',
          updatedAt: '2026-04-26T00:00:00.000Z'
        }
      }}
      onClose={() => undefined}
      onOpenNode={() => undefined}
      recentNodeIds={[]}
      trashedNodeIds={[]}
    />
  );

  expect(screen.getByRole('dialog', { name: 'Go to' })).toHaveAttribute('aria-modal', 'true');
});
