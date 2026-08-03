import { beforeEach, describe, expect, it, vi } from 'vitest';

const addListener = vi.fn();
const getState = vi.fn();
const companionBootstrapState = vi.hoisted(() => ({
  isNativeCompanionRuntime: vi.fn(() => false)
}));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener,
    getState
  }
}));

vi.mock('./companionBootstrap', () => companionBootstrapState);

async function expectForegroundLifecycleSubscription() {
  const removeAppState = vi.fn(async () => undefined);
  const removeResume = vi.fn(async () => undefined);
  const appStateHandler = vi.fn();
  const resumeHandler = vi.fn();

  addListener
    .mockImplementationOnce(async (_eventName: string, listener: (payload: { isActive: boolean }) => void) => {
      appStateHandler.mockImplementation(listener);
      return { remove: removeAppState };
    })
    .mockImplementationOnce(async (_eventName: string, listener: () => void) => {
      resumeHandler.mockImplementation(listener);
      return { remove: removeResume };
    });

  companionBootstrapState.isNativeCompanionRuntime.mockReturnValue(true);

  const { subscribeNativeAppForeground } = await import('./appLifecycle');
  const onForeground = vi.fn();
  const unsubscribe = await subscribeNativeAppForeground(onForeground);

  expect(addListener).toHaveBeenNthCalledWith(1, 'appStateChange', expect.any(Function));
  expect(addListener).toHaveBeenNthCalledWith(2, 'resume', expect.any(Function));

  appStateHandler({ isActive: false });
  expect(onForeground).not.toHaveBeenCalled();

  appStateHandler({ isActive: true });
  resumeHandler();
  expect(onForeground).toHaveBeenCalledTimes(2);

  unsubscribe();
  expect(removeAppState).toHaveBeenCalledTimes(1);
  expect(removeResume).toHaveBeenCalledTimes(1);
}

async function expectBackgroundLifecycleSubscription() {
  const removeAppState = vi.fn(async () => undefined);
  const removePause = vi.fn(async () => undefined);
  const appStateHandler = vi.fn();
  const pauseHandler = vi.fn();

  addListener
    .mockImplementationOnce(async (_eventName: string, listener: (payload: { isActive: boolean }) => void) => {
      appStateHandler.mockImplementation(listener);
      return { remove: removeAppState };
    })
    .mockImplementationOnce(async (_eventName: string, listener: () => void) => {
      pauseHandler.mockImplementation(listener);
      return { remove: removePause };
    });
  companionBootstrapState.isNativeCompanionRuntime.mockReturnValue(true);

  const { subscribeNativeAppBackground } = await import('./appLifecycle');
  const onBackground = vi.fn();
  const unsubscribe = await subscribeNativeAppBackground(onBackground);

  appStateHandler({ isActive: true });
  expect(onBackground).not.toHaveBeenCalled();
  appStateHandler({ isActive: false });
  pauseHandler();
  expect(onBackground).toHaveBeenCalledTimes(2);

  unsubscribe();
  expect(removeAppState).toHaveBeenCalledTimes(1);
  expect(removePause).toHaveBeenCalledTimes(1);
}

describe('appLifecycle', () => {
  beforeEach(() => {
    addListener.mockReset();
    getState.mockReset();
    companionBootstrapState.isNativeCompanionRuntime.mockReturnValue(false);
  });

  it('subscribes foreground listeners on native companion runtimes', expectForegroundLifecycleSubscription);

  it('subscribes background listeners on native companion runtimes', expectBackgroundLifecycleSubscription);

  it('returns a noop unsubscribe outside native runtime', async () => {
    const { subscribeNativeAppForeground } = await import('./appLifecycle');

    const unsubscribe = await subscribeNativeAppForeground(vi.fn());

    expect(addListener).not.toHaveBeenCalled();
    expect(unsubscribe).toBeTypeOf('function');
  });

  it('reads the current native app state for retry gating', async () => {
    companionBootstrapState.isNativeCompanionRuntime.mockReturnValue(true);
    getState.mockResolvedValue({ isActive: false });
    const { readNativeAppActiveState } = await import('./appLifecycle');

    await expect(readNativeAppActiveState()).resolves.toBe(false);
  });
});
