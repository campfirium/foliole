import { act, fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { registerFoliolePublishedDeleteHandler } from '../../shared/platform/runtime/foliolePublishedManagement';
import { useWorkspaceStore } from '../../store/workspaceStore';

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


it('carries the Published rows and view identity through delete confirmation', async () => {
  const next = { ...topic, id: 'topic-2', title: 'Second Topic' };
  publishMocks.loadFoliolePublishedTopicsFromRuntime.mockResolvedValue({
    status: 'ready',
    topics: [topic, next].map((entry, index) => ({
      node_id: entry.id, number: index + 1, source_key: entry.id, source_state: 'active',
      title: entry.title, updated_at: entry.updatedAt, url: null
    }))
  });
  const deleteNodes = vi.fn();
  const original = useWorkspaceStore.getState().deleteNodes;
  useWorkspaceStore.setState({ deleteNodes });
  let approve: (() => void) | undefined;
  const unregister = registerFoliolePublishedDeleteHandler(({ onAllowed }) => { approve = onAllowed; });
  try {
    renderWithLocalization(<PublishedVirtualResultListPanel activeNodeId={topic.id} continueAfterDelete
      nodeOrder={[topic.id, next.id]} nodesById={{ [topic.id]: topic, [next.id]: next }}
      onSelectNode={vi.fn()} trashedNodeIds={[]} />);
    fireEvent.keyDown(await screen.findByRole('treeitem', { name: topic.title }), { key: 'Delete' });
    expect(deleteNodes).not.toHaveBeenCalled();
    expect(approve).toBeTypeOf('function');
    act(() => approve?.());
    expect(deleteNodes).toHaveBeenCalledWith([topic.id], expect.objectContaining({
      activeNodeId: topic.id, candidates: [next.id], folderId: 'special-virtual-published'
    }));
  } finally {
    unregister();
    useWorkspaceStore.setState({ deleteNodes: original });
  }
});
