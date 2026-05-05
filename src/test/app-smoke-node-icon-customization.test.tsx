import { render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { expect, it } from 'vitest';

import { NodeListTree } from '../features/nodes/components/NodeListTree';
import { APP_SETTINGS_STORAGE_KEYS } from '../shared/config/appSettings';
import { useWorkspaceStore } from '../store/workspaceStore';

function createNode(args: {
  id: string;
  title: string;
  review?: {
    due: string;
    difficulty: number;
    elapsedDays: number;
    lapses: number;
    lastReviewAt: string;
    reps: number;
    scheduledDays: number;
    stability: number;
    state: 2;
  } | null;
}) {
  return {
    anchorLink: null,
    createdAt: '2026-04-20T00:00:00.000Z',
    hasContent: true,
    hasReveal: false,
    id: args.id,
    parentNodeId: null,
    reading: null,
    review: args.review ?? null,
    title: args.title,
    updatedAt: '2026-04-20T00:00:00.000Z'
  };
}

function NodeListTreeHarness() {
  const [activeNodeId, setActiveNodeId] = useState<string | null>('reading-1');

  return (
    <NodeListTree
      activeNodeId={activeNodeId}
      isTrashViewOpen={false}
      isVirtualViewOpen={false}
      nodeOrder={['reading-1', 'qa-1']}
      nodesById={{
        'reading-1': createNode({ id: 'reading-1', title: 'Reading 1' }),
        'qa-1': createNode({
          id: 'qa-1',
          title: 'QA Node',
          review: {
            due: '2026-04-20T00:00:00.000Z',
            difficulty: 1,
            elapsedDays: 1,
            lapses: 0,
            lastReviewAt: '2026-04-20T00:00:00.000Z',
            reps: 1,
            scheduledDays: 1,
            stability: 1,
            state: 2
          }
        })
      }}
      onOpenMoveToNode={() => undefined}
      onOpenNotesView={() => undefined}
      onSelectNode={setActiveNodeId}
      onSelectTrashNode={() => undefined}
      selectedTrashNodeId={null}
    />
  );
}

it('keeps navigation trees icon-free even when icon settings exist', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.nodeIconPendingColor, '#ff6600');
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledColor, '#0055aa');
  useWorkspaceStore.setState((state) => ({
    ...state,
    trashedNodeIds: []
  }));

  render(<NodeListTreeHarness />);

  const listPanel = screen.getByRole('complementary', { name: 'Node list panel' });
  expect(within(listPanel).getByRole('treeitem', { name: 'Reading 1' }).querySelector('[data-node-icon]')).toBeNull();
  expect(within(listPanel).getByRole('treeitem', { name: 'QA Node' }).querySelector('[data-node-icon]')).toBeNull();
});
