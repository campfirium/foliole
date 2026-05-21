import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../features/settings/model/reviewSchedulerSettings';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { createTestWorkspaceState } from '../../test/workspaceStateTestSupport';

import { WorkspaceRightSidebar } from './WorkspaceRightSidebar';

vi.mock('../../features/pdf/model/pdfSystemBridge', () => ({
  requestPdfAnchorJump: vi.fn()
}));

function createNode(overrides: Partial<Node>): Node {
  return {
    id: overrides.id ?? 'node-1',
    parentNodeId: overrides.parentNodeId ?? null,
    kind: overrides.kind ?? 'topic',
    title: overrides.title ?? 'Node',
    content: overrides.content ?? '',
    anchorLink: overrides.anchorLink ?? null,
    reveal: overrides.reveal ?? null,
    review: overrides.review ?? null,
    createdAt: overrides.createdAt ?? '2026-05-21T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-05-21T00:00:00.000Z'
  };
}

beforeEach(() => {
  useWorkspaceStore.setState(createTestWorkspaceState());
});

it('shows editor history diagnostics in the existing dev panel', () => {
  useWorkspaceStore.setState({
    appActionHistory: { redoStack: [], undoStack: [] },
    editorOperationHistory: {
      redoStack: [],
      undoStack: [
        {
          annotations: [
            {
              kind: 'highlight',
              nodeId: 'highlight-1',
              parentNodeId: 'node-1'
            }
          ],
          nodeId: 'node-1',
          title: 'Create Annotation',
          type: 'annotation.create'
        }
      ]
    }
  });

  render(
    <WorkspaceRightSidebar
      activeNodeId="node-1"
      activePanelId="dev"
      nodeOrder={['node-1', 'highlight-1']}
      nodesById={{
        'highlight-1': createNode({ id: 'highlight-1', parentNodeId: 'node-1' }),
        'node-1': createNode({ id: 'node-1', content: 'Alpha Beta' })
      }}
      onRevealAnchorInDocument={vi.fn()}
      onSelectBreadcrumbNode={vi.fn()}
      onSelectNode={vi.fn()}
      reviewCurrentNodeId={null}
      reviewQueueNodeIds={[]}
      reviewSchedulerSettings={DEFAULT_REVIEW_SCHEDULER_SETTINGS}
      trashedNodeIds={[]}
    />
  );

  expect(screen.getByRole('heading', { name: 'History' })).toBeInTheDocument();
  expect(screen.getByText('Undo matches')).toBeInTheDocument();
  expect(screen.getByText('Create Annotation | 1 item')).toBeInTheDocument();
  expect(screen.getByRole('list', { name: 'Recent editor undo entries' })).toHaveTextContent('annotation.create');
  expect(screen.getByText('node-1 -> highlight-1')).toBeInTheDocument();
});
