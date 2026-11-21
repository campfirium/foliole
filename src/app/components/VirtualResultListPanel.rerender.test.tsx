import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { toWorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import { VirtualResultListPanel } from './VirtualResultListPanel';

const treeProps: Array<{ itemIds: string[]; nodesById: unknown }> = [];

vi.mock('./WorkspaceTopicTree', () => ({
  WorkspaceTopicTree: (props: { itemIds: string[]; nodesById: unknown }) => {
    treeProps.push(props);
    return null;
  }
}));

vi.mock('../../features/nodes/model/workspaceListNode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/nodes/model/workspaceListNode')>();
  return { ...actual, toWorkspaceListNodesById: vi.fn(actual.toWorkspaceListNodesById) };
});

function createNode(id: string): Node {
  return {
    content: '',
    createdAt: '2026-05-01T00:00:00.000Z',
    id,
    kind: 'topic',
    parentNodeId: null,
    reveal: null,
    review: null,
    title: id,
    updatedAt: '2026-05-01T00:00:00.000Z'
  };
}

const first = createNode('first');
const second = createNode('second');
const library = { first, second };

// The host rebuilds the result array on every render, as workspaceDualListVirtualContent does.
function Host(props: { library: Record<string, Node>; tick: number }) {
  return (
    <VirtualResultListPanel
      activeNodeId={null}
      emptyState={null}
      header={{ kind: 'description', text: '', title: 'Saved' }}
      nodeOrder={['first', 'second']}
      nodes={[props.library.first!, props.library.second!]}
      nodesById={props.library}
      onSelectNode={() => undefined}
    />
  );
}

describe('VirtualResultListPanel re-renders', () => {
  beforeEach(() => {
    treeProps.length = 0;
    vi.mocked(toWorkspaceListNodesById).mockClear();
  });

  it('projects the library once and keeps tree inputs stable across host re-renders', () => {
    const view = render(<Host library={library} tick={0} />);
    for (let tick = 1; tick <= 5; tick += 1) view.rerender(<Host library={library} tick={tick} />);

    expect(toWorkspaceListNodesById).toHaveBeenCalledTimes(1);
    expect(new Set(treeProps.map((props) => props.nodesById)).size).toBe(1);
    expect(new Set(treeProps.map((props) => props.itemIds)).size).toBe(1);

    view.rerender(<Host library={{ ...library, second: { ...second, title: 'renamed' } }} tick={6} />);
    expect(toWorkspaceListNodesById).toHaveBeenCalledTimes(2);
  });
});
