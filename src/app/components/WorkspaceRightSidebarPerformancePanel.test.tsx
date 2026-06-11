import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { inspectorPanelSectionClassName } from '../../shared/ui';

import { WorkspaceRightSidebarPerformancePanel } from './WorkspaceRightSidebarPerformancePanel';

function createNode(overrides: Partial<Node> = {}): Node {
  return {
    anchorLink: null,
    content: 'Body',
    createdAt: '2026-04-05T00:00:00.000Z',
    id: 'node-1',
    kind: 'topic',
    parentNodeId: null,
    reading: null,
    reveal: null,
    review: null,
    title: 'Node',
    updatedAt: '2026-04-05T00:00:00.000Z',
    ...overrides
  };
}

it('keeps performance sections on the right panel inset token', () => {
  renderWithLocalization(
    <WorkspaceRightSidebarPerformancePanel
      activeNodeId="node-1"
      nodesById={{ 'node-1': createNode() }}
    />
  );

  for (const name of ['Timing', 'Memory', 'Cache']) {
    const section = screen.getByRole('heading', { name }).closest('section');
    expect(section).toHaveClass(inspectorPanelSectionClassName);
    expect(section).toHaveClass('bg-transparent');
  }
});
