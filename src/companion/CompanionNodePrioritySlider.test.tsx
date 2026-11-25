import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { CompanionNodePrioritySlider } from './CompanionNodePrioritySlider';

const base = { content: '', anchorLink: null, reveal: null, review: null, createdAt: '', updatedAt: '' };
const nodesById = {
  folder: { ...base, id: 'folder', kind: 'folder', title: 'Category', parentNodeId: null, priority: 3, enforcePriority: true },
  topic: { ...base, id: 'topic', kind: 'topic', title: 'Topic', parentNodeId: 'folder', priority: 7 }
};

vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', () => ({
  isAvailableNativeAndroidCompanionRuntime: () => true
}));
vi.mock('./CompanionWorkspaceActions', () => ({
  useCompanionWorkspaceActions: () => ({
    snapshot: { nodesById }, flowActive: false, busy: false, pending: false, failure: null, execute: vi.fn()
  })
}));

it('keeps the stored value editable and names the enforcing folder', () => {
  render(<CompanionNodePrioritySlider nodeId="topic" onSaved={vi.fn()} />);

  expect(screen.getByRole('slider')).toHaveValue('7');
  expect(screen.getByRole('slider')).toBeEnabled();
  expect(screen.getByText('Inactive · P3 · Category (Enforced)')).toBeInTheDocument();
});
