import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { collectRemovedTopicIds, collectShelvedTopicIds } from '../../features/nodes/model/builtinVirtualTopicIds';
import type { Node } from '../../features/nodes/model/nodeTypes';
import {
  INBOX_NODE_ID,
  VIRTUAL_REMOVED_NODE_ID,
  VIRTUAL_ROOT_NODE_ID,
  VIRTUAL_SHELVED_NODE_ID
} from '../../features/nodes/model/specialNodes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceDualListContent } from './WorkspaceDualListContent';
import { createWorkspaceContentNode } from './WorkspaceDualListContent.testUtils';

const panelNodes: Node[][] = [];

vi.mock('./VirtualResultListPanel', () => ({
  VirtualResultListPanel: (props: { nodes: Node[] }) => {
    panelNodes.push(props.nodes);
    return null;
  }
}));

vi.mock('../../features/nodes/model/builtinVirtualTopicIds', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/nodes/model/builtinVirtualTopicIds')>();
  return {
    ...actual,
    collectRemovedTopicIds: vi.fn(actual.collectRemovedTopicIds),
    collectShelvedTopicIds: vi.fn(actual.collectShelvedTopicIds)
  };
});

const shelvedTopic = {
  ...createWorkspaceContentNode({ id: 'shelved-topic', kind: 'topic', parentNodeId: INBOX_NODE_ID, title: 'Shelved' }),
  shelvedAt: '2026-05-01T00:00:00.000Z'
};
const trashedTopic = createWorkspaceContentNode({ id: 'trashed-topic', kind: 'topic', parentNodeId: INBOX_NODE_ID, title: 'Trashed' });
const library: Record<string, Node> = {
  [INBOX_NODE_ID]: createWorkspaceContentNode({ id: INBOX_NODE_ID, kind: 'folder', specialKind: 'inbox', title: 'Inbox' }),
  [VIRTUAL_ROOT_NODE_ID]: createWorkspaceContentNode({ id: VIRTUAL_ROOT_NODE_ID, kind: 'folder', specialKind: 'virtual-root', title: 'Virtual' }),
  'shelved-topic': shelvedTopic,
  'trashed-topic': trashedTopic
};
const nodeOrder = [INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID, 'shelved-topic', 'trashed-topic'];
const trashedNodeIds = ['trashed-topic'];
const callbacks = {
  onOpenExternalSelection: vi.fn(),
  onOpenMoveToNode: vi.fn(),
  onOpenNotesView: vi.fn(),
  onOpenTrashView: vi.fn(),
  onOpenVirtualView: vi.fn(),
  onSelectNode: vi.fn(),
  onSelectNodeInVirtualView: vi.fn(),
  onSelectTrashNode: vi.fn()
};
const externalEntriesByFolderId = {};
const externalFolders: never[] = [];
const externalSelection = { kind: 'root' as const };

function Host(overrides: Partial<ComponentProps<typeof WorkspaceDualListContent>>) {
  return (
    <WorkspaceDualListContent
      activeNodeId={null}
      activeVirtualNodeId={VIRTUAL_SHELVED_NODE_ID}
      externalEntriesByFolderId={externalEntriesByFolderId}
      externalFolders={externalFolders}
      externalSelection={externalSelection}
      isExternalViewOpen={false}
      isStudyMode={false}
      isTrashViewOpen={false}
      isVirtualViewOpen
      listNodesById={library}
      nodeOrder={nodeOrder}
      nodesById={library}
      reviewCurrentNodeId={null}
      selectedTrashNodeId={null}
      trashedNodeIds={trashedNodeIds}
      {...callbacks}
      {...overrides}
    />
  );
}

describe('virtual content column re-renders', () => {
  beforeEach(() => {
    panelNodes.length = 0;
    vi.mocked(collectShelvedTopicIds).mockClear();
    vi.mocked(collectRemovedTopicIds).mockClear();
  });

  it('collects results once for unchanged library inputs and recollects when they change', () => {
    const view = renderWithLocalization(<Host />);
    for (let tick = 1; tick <= 6; tick += 1) view.rerender(<Host />);

    expect(collectShelvedTopicIds).toHaveBeenCalledTimes(1);
    expect(new Set(panelNodes).size).toBe(1);
    expect(panelNodes.at(-1)?.map((node) => node.id)).toEqual(['shelved-topic']);

    view.rerender(<Host activeVirtualNodeId={VIRTUAL_REMOVED_NODE_ID} />);
    expect(collectRemovedTopicIds).toHaveBeenCalledTimes(1);
    expect(panelNodes.at(-1)?.map((node) => node.id)).toEqual(['trashed-topic']);

    const renamed = { ...library, 'shelved-topic': { ...shelvedTopic, title: 'Renamed' } };
    view.rerender(<Host nodesById={renamed} />);
    expect(collectShelvedTopicIds).toHaveBeenCalledTimes(2);
    expect(panelNodes.at(-1)?.[0]?.title).toBe('Renamed');
  });
});
