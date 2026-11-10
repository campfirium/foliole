import { fireEvent, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { FolderSectionStack } from '../../features/nodes/components/FolderSectionStack';
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

it('keeps folder sources available after collapsing and reopening the Dive section', async () => {
  renderWithLocalization(
    <FolderSectionStack><WorkspaceDiveSection activeSource={null} activeDiveId={null} onSelectDive={vi.fn()} onSelectNode={vi.fn()}
      dives={[{ id: 'probability', title: 'Probability', directSourceIds: ['folder', 'topic'] }]} nodesById={{
      folder: source('folder', 'folder', 'Probability notes'),
      topic: source('topic', 'topic', 'Bayes’ theorem')
    }} /></FolderSectionStack>
  );
  const tree = within(screen.getByRole('tree', { name: 'Dive' }));
  const heading = tree.getByRole('treeitem', { name: 'Dive' });
  expect(tree.getByRole('treeitem', { name: 'Probability notes' })).toBeVisible();

  fireEvent.click(heading);
  expect(heading).toHaveAttribute('aria-expanded', 'false');
  expect(tree.queryByRole('treeitem', { name: 'Probability' })).toBeNull();

  fireEvent.click(heading);
  expect(heading).toHaveAttribute('aria-expanded', 'true');
  const folder = await tree.findByRole('treeitem', { name: 'Probability notes' });
  expect(folder.querySelector('[data-node-icon], [data-node-tree-chevron-placeholder]')).toBeNull();
  expect(tree.queryByRole('treeitem', { name: 'Bayes’ theorem' })).toBeNull();
});
