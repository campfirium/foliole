import { screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { createManualVirtualNodeFilter } from '../../../lib/core/nodes/virtualNodeFilter';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { VIRTUAL_ROOT_NODE_ID } from '../../features/nodes/model/specialNodes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { VirtualDocumentSurface } from './VirtualDocumentSurface';

function topic(id: string, title: string): Node {
  return {
    content: '',
    createdAt: '2026-07-18T00:00:00.000Z',
    id,
    kind: 'topic',
    parentNodeId: null,
    reveal: null,
    review: null,
    title,
    updatedAt: '2026-07-18T00:00:00.000Z'
  };
}

it('uses the saved virtual folder order in the document cards', () => {
  const alpha = topic('alpha', 'Alpha');
  const beta = topic('beta', 'Beta');
  const virtualFolder: Node = {
    ...topic('virtual-folder', 'Reading path'),
    kind: 'folder',
    manualChildOrder: ['beta', 'alpha'],
    parentNodeId: VIRTUAL_ROOT_NODE_ID,
    specialKind: 'virtual',
    virtualFilter: createManualVirtualNodeFilter()
  };
  const nodesById = { alpha, beta, 'virtual-folder': virtualFolder };

  renderWithLocalization(
    <VirtualDocumentSurface
      activeNode={virtualFolder}
      nodeOrder={['virtual-folder', 'alpha', 'beta']}
      nodesById={nodesById}
      onSelectNode={vi.fn()}
      onSelectNodePath={vi.fn()}
      pdfCache={<div />}
      trashedNodeIds={[]}
    />
  );

  expect(screen.getByRole('button', { name: 'Sort list by Manual' })).toBeInTheDocument();
  expect(
    within(screen.getByRole('list', { name: 'Folder contents' }))
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'))
  ).toEqual(['Open Beta', 'Open Alpha']);
});
