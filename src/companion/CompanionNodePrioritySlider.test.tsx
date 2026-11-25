import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { CompanionNodePrioritySlider } from './CompanionNodePrioritySlider';

const base = { content: '', anchorLink: null, reveal: null, review: null, createdAt: '', updatedAt: '' };
const nodesById = {
  folder: { ...base, id: 'folder', kind: 'folder', title: 'Category', parentNodeId: null, priority: 3, enforcePriority: true },
  topic: { ...base, id: 'topic', kind: 'topic', title: 'Topic', parentNodeId: 'folder', priority: 7 }
};

const host = vi.hoisted(() => ({ platform: 'android' }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => host.platform, isNativePlatform: () => true, isPluginAvailable: () => false },
  registerPlugin: vi.fn(() => ({}))
}));
vi.mock('./CompanionWorkspaceActions', () => ({
  useCompanionWorkspaceActions: () => ({
    snapshot: { nodesById }, flowActive: false, busy: false, pending: false, failure: null, execute: vi.fn()
  })
}));

afterEach(cleanup);

it.each(['android', 'ios'])('keeps the stored value editable and names the enforcing folder on %s', platform => {
  host.platform = platform;
  render(<CompanionNodePrioritySlider nodeId="topic" onSaved={vi.fn()} />);

  expect(screen.getByRole('slider')).toHaveValue('7');
  expect(screen.getByRole('slider')).toBeEnabled();
  expect(screen.getByText('Inactive · P3 · Category (Enforced)')).toBeInTheDocument();
});
