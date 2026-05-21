import type { PersistedWindowState } from './ipc/windowState.js';

type AppendBootEvent = (stage: string, payload?: unknown) => Promise<void>;

interface StartupWindowStateOptions {
  appendBootEvent: AppendBootEvent;
  env?: NodeJS.ProcessEnv;
  loadWindowState: () => Promise<PersistedWindowState | null>;
}

export function shouldSkipStartupWindowState(env: NodeJS.ProcessEnv = process.env) {
  return env.FOLIOLE_SKIP_STARTUP_WINDOW_STATE === '1';
}

export async function loadStartupWindowState({
  appendBootEvent,
  env = process.env,
  loadWindowState
}: StartupWindowStateOptions) {
  if (shouldSkipStartupWindowState(env)) {
    await appendBootEvent('window_state_skipped', {
      reason: 'startup-window-state-disabled'
    });
    return null;
  }
  return loadWindowState();
}
