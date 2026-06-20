import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceRightSidebarReviewQueuePanel } from './WorkspaceRightSidebarReviewQueuePanel';

function createNode(overrides: Partial<Node>): Node {
  return {
    id: overrides.id ?? 'node-1',
    parentNodeId: overrides.parentNodeId ?? null,
    kind: overrides.kind ?? 'topic',
    title: overrides.title ?? 'Node',
    content: overrides.content ?? 'Body',
    anchorLink: overrides.anchorLink ?? null,
    reading: overrides.reading ?? null,
    reveal: overrides.reveal ?? null,
    review: overrides.review ?? null,
    createdAt: overrides.createdAt ?? '2026-04-05T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-05T00:00:00.000Z'
  };
}

it('keeps Demo controls out of the Flow queue panel surface', () => {
  renderWithLocalization(
    <WorkspaceRightSidebarReviewQueuePanel
      currentNodeId={null}
      flowWindow={{ queueNodeIds: [], readyNodeIds: [], upcomingNodeIds: ['reading-later'] }}
      nodesById={{
        'reading-later': createNode({ id: 'reading-later', title: 'Reading Later' })
      }}
      onSelectNode={() => undefined}
    />
  );

  expect(screen.queryByRole('region', { name: 'Demo controls' })).toBeNull();
  expect(screen.queryByText('Clear local data')).toBeNull();
});
