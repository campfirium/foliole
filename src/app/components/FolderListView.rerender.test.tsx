import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sortFolderListNodes } from '../../features/nodes/model/folderListOrdering';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { FolderListView } from './FolderListView';

vi.mock('../../features/nodes/model/folderListOrdering', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/nodes/model/folderListOrdering')>();
  return { ...actual, sortFolderListNodes: vi.fn(actual.sortFolderListNodes) };
});

function createNode(id: string, parentNodeId: string | null, kind: Node['kind'] = 'topic'): Node {
  return {
    content: '',
    createdAt: '2026-04-01T09:00:00.000Z',
    id,
    kind,
    openingText: null,
    parentNodeId,
    reveal: null,
    review: null,
    title: id,
    updatedAt: '2026-04-02T10:30:00.000Z'
  };
}

const folder = createNode('folder-1', null, 'folder');
const children = ['a', 'b', 'c'].map((id) => createNode(id, 'folder-1'));
const nodesById = Object.fromEntries([folder, ...children].map((node) => [node.id, node]));
const nodeOrder = ['folder-1', 'a', 'b', 'c'];

// Hosts pass fresh callbacks on every render; the folder contents stay the same.
function List(props: { tick: number }) {
  return (
    <FolderListView
      folderNodeId="folder-1"
      nodeOrder={nodeOrder}
      nodeViewById={{}}
      nodesById={nodesById}
      onChangeSortDirection={() => props.tick}
      onChangeSortKey={() => props.tick}
      onSelectNode={() => props.tick}
      sortKey="manual"
    />
  );
}

describe('FolderListView re-renders in manual order', () => {
  beforeEach(() => {
    vi.mocked(sortFolderListNodes).mockClear();
  });

  it('sorts the folder once while its contents are unchanged', () => {
    const view = renderWithLocalization(<List tick={0} />);
    const sortsAfterMount = vi.mocked(sortFolderListNodes).mock.calls.length;
    expect(sortsAfterMount).toBeGreaterThan(0);
    for (let tick = 1; tick <= 5; tick += 1) view.rerender(<List tick={tick} />);
    expect(sortFolderListNodes).toHaveBeenCalledTimes(sortsAfterMount);
  });
});
