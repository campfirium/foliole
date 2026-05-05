import { beforeEach, describe, expect, it, vi } from 'vitest';

const addListener = vi.fn();
const companionBootstrapState = vi.hoisted(() => ({
  isNativeCompanionRuntime: vi.fn(() => false)
}));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener
  }
}));

vi.mock('./companionBootstrap', () => companionBootstrapState);

describe('appLifecycle', () => {
  beforeEach(() => {
    addListener.mockReset();
    companionBootstrapState.isNativeCompanionRuntime.mockReturnValue(false);
  });

  it('subscribes native foreground listeners on android companion runtime', async () => {
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
  });

  it('returns a noop unsubscribe outside native runtime', async () => {
    const { subscribeNativeAppForeground } = await import('./appLifecycle');

    const unsubscribe = await subscribeNativeAppForeground(vi.fn());

    expect(addListener).not.toHaveBeenCalled();
    expect(unsubscribe).toBeTypeOf('function');
  });
});
