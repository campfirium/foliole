import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { useWorkspaceStore } from '../../store/workspaceStore';

import { useWorkspaceSelectors } from './appWorkspaceSelectors';

const initial = useWorkspaceStore.getState();
const now = '2026-11-16T09:00:00.000Z';

afterEach(() => {
  act(() => { useWorkspaceStore.setState(initial); });
  delete window.__folioleFlushPendingEditorDraftBeforeClose;
});

function prepare() {
  const grade = vi.fn().mockResolvedValue(true);
  useWorkspaceStore.setState({
    libraryScope: 'grade-library', activeNodeId: 'a',
    nodesById: { ...initial.nodesById, ...Object.fromEntries(['a', 'b'].map(id => [id, {
      id, title: id, content: `Saved ${id}`, kind: 'item' as const, parentNodeId: null, reveal: null,
      createdAt: now, updatedAt: now
    }])) },
    nodeOrder: [...initial.nodeOrder, 'a', 'b'],
    reviewSession: { ...initial.reviewSession, currentNodeId: 'a', queueNodeIds: ['a', 'b'], isAnswerRevealed: true },
    gradeReviewCard: grade
  });
  const hook = renderHook(() => useWorkspaceSelectors().gradeReviewCard);
  return { ...hook, grade };
}

it.each([1, 2, 3, 4] as const)('finishes the current draft before submitting grade %s', async rating => {
  const app = prepare();
  let finish!: (saved: boolean) => void;
  window.__folioleFlushPendingEditorDraftBeforeClose = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
  let pending!: Promise<boolean>;
  act(() => { pending = app.result.current(rating, now); });
  expect(window.__folioleFlushPendingEditorDraftBeforeClose).toHaveBeenCalledOnce();
  expect(app.grade).not.toHaveBeenCalled();
  await act(async () => { finish(true); await expect(pending).resolves.toBe(true); });
  expect(app.grade).toHaveBeenCalledExactlyOnceWith(rating, now);
});

it.each(['false', 'throw', 'missing'] as const)('does not grade when the draft flush is %s', async outcome => {
  const app = prepare();
  if (outcome !== 'missing') window.__folioleFlushPendingEditorDraftBeforeClose = async () => {
    if (outcome === 'throw') throw new Error('save_failed');
    return false;
  };
  await act(async () => { await expect(app.result.current(3, now)).resolves.toBe(false); });
  expect(app.grade).not.toHaveBeenCalled();
});

it.each(['library', 'active', 'current', 'reveal'] as const)('does not grade a changed %s context after saving', async change => {
  const app = prepare();
  window.__folioleFlushPendingEditorDraftBeforeClose = async () => {
    useWorkspaceStore.setState(state => change === 'library' ? { libraryScope: 'other' }
      : change === 'active' ? { activeNodeId: 'b' }
      : { reviewSession: { ...state.reviewSession,
        ...(change === 'current' ? { currentNodeId: 'b' } : { isAnswerRevealed: false }) } });
    return true;
  };
  await act(async () => { await expect(app.result.current(3, now)).resolves.toBe(false); });
  expect(app.grade).not.toHaveBeenCalled();
});

it('accepts an unchanged context refresh and submits through the latest action after saving', async () => {
  const app = prepare();
  const latest = vi.fn().mockResolvedValue(true);
  window.__folioleFlushPendingEditorDraftBeforeClose = async () => {
    useWorkspaceStore.setState(state => ({ reviewSession: { ...state.reviewSession }, gradeReviewCard: latest }));
    return true;
  };
  await act(async () => { await expect(app.result.current(3, now)).resolves.toBe(true); });
  expect(app.grade).not.toHaveBeenCalled();
  expect(latest).toHaveBeenCalledExactlyOnceWith(3, now);
});
