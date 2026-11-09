import { screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { WorkspaceListNode } from '../../features/nodes/model/workspaceListNode';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceDiveSection } from './WorkspaceDiveSection';

vi.mock('../../shared/platform/desktop/diveRepository', () => ({
  getDiveRepository: () => ({})
}));

function source(id: string, kind: 'folder' | 'topic', title: string): WorkspaceListNode {
  return {
    id, kind, title, parentNodeId: null, review: null, hasContent: kind === 'topic', hasReveal: false,
    createdAt: '2026-11-08T00:00:00Z', updatedAt: '2026-11-08T00:00:00Z'
  };
}

it('shows only folder sources in the Dive directory', async () => {
  renderWithLocalization(
    <WorkspaceDiveSection activeNodeId={null} activeDiveId={null} onSelectDive={vi.fn()} onSelectNode={vi.fn()}
      dives={[{ id: 'probability', title: 'Probability', directSourceIds: ['folder', 'topic'] }]} nodesById={{
      folder: source('folder', 'folder', 'Probability notes'),
      topic: source('topic', 'topic', 'Bayes’ theorem')
    }} />
  );
  const tree = within(screen.getByRole('tree', { name: 'Dives' }));
  const folder = await tree.findByRole('treeitem', { name: 'Probability notes' });
  expect(folder.querySelector('[data-node-icon], [data-node-tree-chevron-placeholder]')).toBeNull();
  expect(tree.queryByRole('treeitem', { name: 'Bayes’ theorem' })).toBeNull();
});
