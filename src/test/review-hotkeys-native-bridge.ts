import { vi } from 'vitest';

import type { ElectronAPI, NativeKeyboardInputPayload } from '../shared/platform/electronApi';
import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import { createSmokeRuntimeInvoke, FIXED_TIMESTAMP } from './app-smoke.shared';

type SchedulerRequestPayload = {
  request?: {
    card?: Record<string, unknown>;
    now?: string;
  };
};

function createSchedulerGradeResult(request?: SchedulerRequestPayload['request']) {
  const card = request?.card ?? {};
  const reviewedAt = request?.now ?? FIXED_TIMESTAMP;
  return {
    card: {
      ...card,
      due: reviewedAt,
      last_review: reviewedAt,
      reps: typeof card.reps === 'number' ? card.reps + 1 : 1,
      scheduled_days: 1,
      stability: 1,
      state: 2
    },
    reviewed_at: reviewedAt
  };
}

function createSchedulerPreviewResult(request?: SchedulerRequestPayload['request']) {
  const result = createSchedulerGradeResult(request);
  return {
    Again: result,
    Easy: result,
    Good: result,
    Hard: result
  };
}

export function resetReviewHotkeysRuntimeInvokeMock() {
  vi.mocked(getRuntimeInvoke).mockImplementation(() => window.electronAPI?.invoke ?? createSmokeRuntimeInvoke());
}

export function installNativeKeyboardBridge() {
  const handlers = new Set<(payload: NativeKeyboardInputPayload) => void>();
  const baseInvoke = createSmokeRuntimeInvoke();
  const invoke = vi.fn(async (command: string, payload?: SchedulerRequestPayload) => {
    if (command === 'review_grade') return createSchedulerGradeResult(payload?.request);
    if (command === 'review_preview') return createSchedulerPreviewResult(payload?.request);
    return baseInvoke(command, payload);
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
  window.electronAPI = {
    invoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeKeyboardInput: (nextHandler: (payload: NativeKeyboardInputPayload) => void) => {
      handlers.add(nextHandler);
      return () => {
        handlers.delete(nextHandler);
      };
    },
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  } as unknown as ElectronAPI;
  return (payload: NativeKeyboardInputPayload) => {
    for (const handler of handlers) handler(payload);
  };
}

export function dispatchNativeEscape(dispatchNativeKeyboard: (payload: NativeKeyboardInputPayload) => void) {
  dispatchNativeKeyboard({
    altKey: false,
    code: 'Escape',
    controlKey: false,
    key: 'Escape',
    metaKey: false,
    shiftKey: false,
    type: 'keyDown'
  });
}
