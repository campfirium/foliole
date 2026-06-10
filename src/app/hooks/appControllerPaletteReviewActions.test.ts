import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';

import { resolveReviewDeleteTargetNodeId } from './appControllerPaletteReviewActions';
import type { useWorkspaceSelectors } from './appControllerState';

function createNode(overrides: Partial<Node>): Node {
  const node: Node = {
    id: overrides.id ?? 'topic-1',
    parentNodeId: overrides.parentNodeId ?? null,
    kind: overrides.kind ?? 'topic',
    title: overrides.title ?? 'Topic',
    content: overrides.content ?? '',
    reveal: overrides.reveal ?? null,
    review: overrides.review ?? null,
    createdAt: overrides.createdAt ?? '2026-06-10T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-06-10T00:00:00.000Z'
  };

  if (overrides.specialKind !== undefined) {
    node.specialKind = overrides.specialKind;
  }

  return node;
}

function createWorkspaceSelectorStub(args: {
  activeNodeId: string | null;
  nodesById: Record<string, Node>;
}) {
  return args as ReturnType<typeof useWorkspaceSelectors>;
}

it('resolves review deletion to the main panel topic instead of the session current item', () => {
  const reviewCurrent = createNode({ id: 'review-current', title: 'Review current' });
  const mainPanelTopic = createNode({ id: 'main-panel-topic', title: 'Main panel topic' });

  const nodeId = resolveReviewDeleteTargetNodeId(createWorkspaceSelectorStub({
    activeNodeId: mainPanelTopic.id,
    nodesById: {
      [reviewCurrent.id]: reviewCurrent,
      [mainPanelTopic.id]: mainPanelTopic
    }
  }));

  expect(nodeId).toBe('main-panel-topic');
});

it('does not resolve protected workspace roots as review deletion targets', () => {
  const home = createNode({ id: 'home', specialKind: 'home', title: 'Home' });

  const nodeId = resolveReviewDeleteTargetNodeId(createWorkspaceSelectorStub({
    activeNodeId: home.id,
    nodesById: { [home.id]: home }
  }));

  expect(nodeId).toBeNull();
});
