import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createManualVirtualNodeFilter } from '../../../lib/core/nodes/virtualNodeFilter';
import { sortFolderListNodes } from '../../features/nodes/model/folderListOrdering';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { VIRTUAL_ROOT_NODE_ID } from '../../features/nodes/model/specialNodes';
import { getOrderedVirtualNodeResultNodes } from '../../features/nodes/model/virtualNodeDetail';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { VirtualDocumentSurface } from './VirtualDocumentSurface';

vi.mock('../../features/nodes/model/virtualNodeDetail', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/nodes/model/virtualNodeDetail')>();
  return { ...actual, getOrderedVirtualNodeResultNodes: vi.fn(actual.getOrderedVirtualNodeResultNodes) };
});

vi.mock('../../features/nodes/model/folderListOrdering', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/nodes/model/folderListOrdering')>();
  return { ...actual, sortFolderListNodes: vi.fn(actual.sortFolderListNodes) };
});

function topic(id: string): Node {
  return {
    content: '',
    createdAt: '2026-07-18T00:00:00.000Z',
    id,
    kind: 'topic',
    parentNodeId: null,
    reveal: null,
    review: null,
    title: id,
    updatedAt: '2026-07-18T00:00:00.000Z'
  };
}

const virtualFolder: Node = {
  ...topic('virtual-folder'),
  kind: 'folder',
  manualChildOrder: ['beta', 'alpha'],
  parentNodeId: VIRTUAL_ROOT_NODE_ID,
  specialKind: 'virtual',
  virtualFilter: createManualVirtualNodeFilter()
};
const nodesById = { alpha: topic('alpha'), beta: topic('beta'), 'virtual-folder': virtualFolder };
const nodeOrder = ['virtual-folder', 'alpha', 'beta'];
const trashedNodeIds: string[] = [];

// The document panel passes fresh callbacks and a fresh PDF cache element on every render.
function Surface(props: { tick: number }) {
  return (
    <VirtualDocumentSurface
      activeNode={virtualFolder}
      nodeOrder={nodeOrder}
      nodesById={nodesById}
      onSelectNode={() => props.tick}
      onSelectNodePath={() => props.tick}
      pdfCache={<div />}
      trashedNodeIds={trashedNodeIds}
    />
  );
}

describe('VirtualDocumentSurface re-renders', () => {
  beforeEach(() => {
    vi.mocked(getOrderedVirtualNodeResultNodes).mockClear();
    vi.mocked(sortFolderListNodes).mockClear();
  });

  it('filters and sorts a saved virtual folder once while the library is unchanged', () => {
    const view = renderWithLocalization(<Surface tick={0} />);
    const filtersAfterMount = vi.mocked(getOrderedVirtualNodeResultNodes).mock.calls.length;
    const sortsAfterMount = vi.mocked(sortFolderListNodes).mock.calls.length;
    for (let tick = 1; tick <= 5; tick += 1) view.rerender(<Surface tick={tick} />);
    expect(getOrderedVirtualNodeResultNodes).toHaveBeenCalledTimes(filtersAfterMount);
    expect(sortFolderListNodes).toHaveBeenCalledTimes(sortsAfterMount);
  });
});
