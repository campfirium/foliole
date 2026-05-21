import { describe, expect, it, vi } from 'vitest';

import { loadStartupWindowState, shouldSkipStartupWindowState } from './startupWindowState.js';

describe('startup window state', () => {
  it('loads persisted bounds by default', async () => {
    const appendBootEvent = vi.fn(() => Promise.resolve());
    const state = {
      height: 720,
      isFullScreen: false,
      isMaximized: false,
      width: 1280
    };
    const loadWindowState = vi.fn(() => Promise.resolve(state));

    await expect(loadStartupWindowState({ appendBootEvent, env: {}, loadWindowState })).resolves.toBe(state);
    expect(loadWindowState).toHaveBeenCalledTimes(1);
    expect(appendBootEvent).not.toHaveBeenCalled();
  });

  it('lets native preview create the window without blocking on database-backed bounds', async () => {
    const appendBootEvent = vi.fn(() => Promise.resolve());
    const loadWindowState = vi.fn(() => Promise.resolve(null));

    await expect(loadStartupWindowState({
      appendBootEvent,
      env: { FOLIOLE_SKIP_STARTUP_WINDOW_STATE: '1' },
      loadWindowState
    })).resolves.toBeNull();

    expect(loadWindowState).not.toHaveBeenCalled();
    expect(appendBootEvent).toHaveBeenCalledWith('window_state_skipped', {
      reason: 'startup-window-state-disabled'
    });
  });

  it('recognizes only the explicit skip flag', () => {
    expect(shouldSkipStartupWindowState({ FOLIOLE_SKIP_STARTUP_WINDOW_STATE: '1' })).toBe(true);
    expect(shouldSkipStartupWindowState({ FOLIOLE_SKIP_STARTUP_WINDOW_STATE: '0' })).toBe(false);
  });
});
