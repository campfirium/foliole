import { act, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { createQaNode } from '../../store/workspaceStoreReviewActions.test-support';

const runtime = vi.hoisted(() => ({ load: vi.fn(), changed: null as null | ((payload: { libraryScope: string }) => void) }));
vi.mock('../../shared/platform/nodeBacklinksRuntimeRepository', () => ({ loadRuntimeNodeBacklinks: runtime.load }));
vi.mock('../../shared/platform/runtimeShellEvents', () => ({
  onWorkspaceContentChanged: async (handler: NonNullable<typeof runtime.changed>) => { runtime.changed = handler; return () => {}; },
  onWorkspaceSyncApplied: async () => () => {}
}));
import { WorkspaceRightSidebarBacklinksPanel } from './WorkspaceRightSidebarBacklinksPanel';

it('keeps a saved empty result visible while a body save refreshes backlinks, then shows a new link', async () => {
  useWorkspaceStore.setState({ libraryScope: 'a' });
  runtime.load.mockResolvedValueOnce([]);
  renderWithLocalization(<WorkspaceRightSidebarBacklinksPanel activeNodeId="target" nodeOrder={['target']}
    nodesById={{ target: createQaNode('target', '2026-11-06T08:00:00Z') }} trashedNodeIds={[]} onSelectNode={() => {}} />);
  const heading = await screen.findByRole('heading', { name: 'Backlinks' });
  await act(async () => {});
  let finish!: (value: unknown) => void;
  runtime.load.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  act(() => runtime.changed?.({ libraryScope: 'a' }));
  expect(heading).toBeVisible();
  await act(async () => finish([{ sourceNodeId: 'source', sourceTitle: 'New link', context: 'Context', matchCount: 1 }]));
  expect(screen.getByRole('button', { name: /New link/ })).toBeVisible();
});
