import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';

import { WorkspaceRightSidebar } from './WorkspaceRightSidebar';

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
    createdAt: overrides.createdAt ?? '2026-04-05T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-05T00:00:00.000Z'
  };
}

describe('WorkspaceRightSidebar highlights', () => {
  it('opens parent document and reveals pdf locator when clicking a highlight row', () => {
    const onSelectNode = vi.fn();
    const onRevealAnchorInDocument = vi.fn();
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });

    const parentNode = createNode({
      id: 'node-parent',
      content: 'Parent content',
      title: 'Parent'
    });
    const highlightNode = createNode({
      anchorLink: { id: 'pdf-hl-1', kind: 'highlight', locator: { page: 4, x: 0.3, y: 0.6 } },
      content: 'Picked text',
      id: 'node-highlight',
      parentNodeId: 'node-parent',
      title: 'Highlight'
    });

    render(
      <WorkspaceRightSidebar
        activeNodeId="node-parent"
        activePanelId="highlights"
        nodeOrder={['node-parent', 'node-highlight']}
        nodesById={{ 'node-highlight': highlightNode, 'node-parent': parentNode }}
        onRevealAnchorInDocument={onRevealAnchorInDocument}
        onSelectNode={onSelectNode}
        reviewCurrentNodeId={null}
        reviewQueueNodeIds={[]}
        reviewSchedulerSettings={{} as never}
        trashedNodeIds={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /picked text/i }));

    expect(onSelectNode).toHaveBeenCalledWith('node-parent');
    expect(onRevealAnchorInDocument).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pdf-hl-1', kind: 'highlight', locator: { page: 4, x: 0.3, y: 0.6 } })
    );

    raf.mockRestore();
  });
});
