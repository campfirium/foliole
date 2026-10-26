import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { useReviewTrainingIdle } from './useReviewTrainingIdle';

const effects = vi.hoisted(() => ({
  wake: vi.fn(), dispose: vi.fn(), start: vi.fn(), available: true,
  nodes: undefined as undefined | ((state: { nodesById: object }, previous: { nodesById: object }) => void),
  sync: undefined as undefined | (() => void), content: undefined as undefined | (() => void),
  unsubscribe: vi.fn(), unSync: vi.fn(), unContent: vi.fn()
}));
vi.mock('../../features/review/model/reviewTrainingIdle', () => ({ startReviewTrainingIdle: effects.start }));
vi.mock('../../shared/platform/runtimeInvoke', () => ({ isRuntimeInvokeAvailable: () => effects.available }));
vi.mock('../../store/workspaceStore', () => ({ useWorkspaceStore: { subscribe: (callback: typeof effects.nodes) => {
  effects.nodes = callback; return effects.unsubscribe;
} } }));
vi.mock('../../shared/platform/runtimeShellEvents', () => ({
  onWorkspaceSyncApplied: (callback: () => void) => { effects.sync = callback; return Promise.resolve(effects.unSync); },
  onWorkspaceContentChanged: (callback: () => void) => { effects.content = callback; return Promise.resolve(effects.unContent); }
}));
beforeEach(() => {
  vi.clearAllMocks(); effects.available = true;
  effects.start.mockReturnValue({ wake: effects.wake, dispose: effects.dispose });
});

it('wakes idle qualification on local node/grade changes, synced facts and content changes, and releases subscriptions', async () => {
  const hook = renderHook(() => useReviewTrainingIdle(true));
  await act(async () => {});
  const nodes = {};
  effects.nodes!({ nodesById: nodes }, { nodesById: nodes });
  expect(effects.wake).not.toHaveBeenCalled();
  effects.nodes!({ nodesById: {} }, { nodesById: nodes });
  effects.sync!(); effects.content!();
  expect(effects.wake).toHaveBeenCalledTimes(3);
  hook.unmount();
  expect(effects.dispose).toHaveBeenCalledTimes(1);
  expect(effects.unsubscribe).toHaveBeenCalledTimes(1);
  expect(effects.unSync).toHaveBeenCalledTimes(1);
  expect(effects.unContent).toHaveBeenCalledTimes(1);
});

it('does not start before readiness or in a browser-only surface', () => {
  const hook = renderHook(({ enabled }) => useReviewTrainingIdle(enabled), { initialProps: { enabled: false } });
  expect(effects.start).not.toHaveBeenCalled();
  effects.available = false; hook.rerender({ enabled: true });
  expect(effects.start).not.toHaveBeenCalled();
});
