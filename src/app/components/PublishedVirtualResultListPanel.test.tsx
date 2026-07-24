import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

const publishMocks = vi.hoisted(() => ({ loadFoliolePublishedTopicsFromRuntime: vi.fn() }));
vi.mock('../../shared/platform/foliolePublishRepository', () => publishMocks);

import { PublishedVirtualResultListPanel } from './PublishedVirtualResultListPanel';

const topic: Node = {
  content: '# Topic', createdAt: '2026-07-24T00:00:00.000Z', id: 'topic-1', isTitleManual: true,
  kind: 'topic', parentNodeId: null, reveal: null, review: null, title: 'Published Topic', updatedAt: '2026-07-24T00:00:00.000Z'
};

it('keeps the middle column on the shared Topic tree', async () => {
  publishMocks.loadFoliolePublishedTopicsFromRuntime.mockResolvedValue({
    status: 'ready',
    topics: [{
      node_id: 'topic-1', number: 1, source_key: 'source-1', source_state: 'active',
      title: 'Published Topic', updated_at: '2026-07-24T00:00:00.000Z', url: null
    }]
  });

  renderWithLocalization(
    <PublishedVirtualResultListPanel
      activeNodeId={null}
      nodeOrder={[]}
      nodesById={{ 'topic-1': topic }}
      onSelectNode={vi.fn()}
      trashedNodeIds={[]}
    />
  );

  expect(await screen.findByRole('treeitem', { name: 'Published Topic' })).toBeVisible();
});
