import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';

import { useCurrentReviewPreview } from './appControllerHelpers';

const runtime = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => runtime.invoke, isRuntimeInvokeAvailable: () => true }));
vi.mock('../../store/workspaceStore', () => ({ useWorkspaceStore: (select: (state: { libraryScope: string }) => unknown) =>
  select({ libraryScope: 'preview-library' }) }));
vi.mock('./useReviewPreview', () => ({ useReviewPreview: (args: { isReviewSchedulerSettingsReady: boolean; reviewProfile: { reps: number } | null }) =>
  args.isReviewSchedulerSettingsReady ? { Good: { card: { reps: args.reviewProfile?.reps ?? 0 } } } : null }));

const node: Node = { id: 'card', kind: 'item', parentNodeId: null, title: 'Card', content: 'Prompt', reveal: 'Answer',
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
  learningSummary: { reading: null, review: { lastReviewAt: '2026-10-29T00:00:00.000Z' } } };
function Probe({ revealed = true }) {
  const preview = useCurrentReviewPreview(true, { nodesById: { card: node },
    reviewSession: { currentNodeId: 'card', isAnswerRevealed: revealed } }, 'settings', true);
  return <output>{preview?.Good.card.reps ?? 'waiting'}</output>;
}
beforeEach(() => runtime.invoke.mockReset());
afterEach(() => vi.restoreAllMocks());

it('waits for database card facts before calculating the grade preview and releases them when hidden', async () => {
  let finish!: (value: unknown) => void;
  runtime.invoke.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const view = render(<Probe />);
  expect(screen.getByRole('status')).toHaveTextContent('waiting');
  expect(runtime.invoke).toHaveBeenCalledWith('load_node_learning', { nodeIds: ['card'], libraryScope: 'preview-library' });
  finish([{ nodeId: 'card', reading: null, review: { due: node.updatedAt, lastReviewAt: node.updatedAt,
    state: 2, stability: 7, difficulty: 4, elapsedDays: 2, scheduledDays: 20, reps: 9, lapses: 1 } }]);
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('9'));
  view.rerender(<Probe revealed={false} />);
  expect(screen.getByRole('status')).toHaveTextContent('waiting');
});

it('does not substitute a new card when the database query fails', async () => {
  runtime.invoke.mockImplementation(async command => {
    if (command === 'load_node_learning') throw new Error('database_unavailable');
    return null;
  });
  render(<Probe />);
  await waitFor(() => expect(runtime.invoke.mock.calls.filter(([command]) => command === 'load_node_learning')).toHaveLength(1));
  expect(screen.getByRole('status')).toHaveTextContent('waiting');
});
