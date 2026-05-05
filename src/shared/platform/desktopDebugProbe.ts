import { getElectronAPI } from './electronApi';

const MAX_RECENT_INVOKE_FAILURES = 5;

export interface DesktopDebugInvokeFailure {
  args?: unknown;
  command: string;
  error: {
    message: string;
    name?: string;
  };
  timestamp: string;
}

export interface DesktopDebugProbeSnapshot {
  bridgeAvailable: boolean;
  recentInvokeFailures: DesktopDebugInvokeFailure[];
  runtimeHead: string | null;
}

interface DesktopDebugProbeController {
  getSnapshot: () => DesktopDebugProbeSnapshot;
}

declare global {
  interface Window {
    __FOLIOLE_DESKTOP_DEBUG_PROBE__?: DesktopDebugProbeController;
  }
}

let recentInvokeFailures: DesktopDebugInvokeFailure[] = [];

function cloneValue<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function isDesktopDebugProbeEnabled() {
  if (typeof window === 'undefined') {
    return false;
  }
  return import.meta.env.DEV || import.meta.env.MODE === 'test' || Boolean(getElectronAPI()?.debug);
}

function getRuntimeHead() {
  return getElectronAPI()?.debug?.runtimeHead ?? null;
}

function toErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name
    };
  }
  return {
    message: String(error)
  };
}

function getSnapshot(): DesktopDebugProbeSnapshot {
  return {
    bridgeAvailable: Boolean(getElectronAPI()),
    recentInvokeFailures: recentInvokeFailures.map((entry) => cloneValue(entry)),
    runtimeHead: getRuntimeHead()
  };
}

export function installDesktopDebugProbe() {
  if (!isDesktopDebugProbeEnabled() || typeof window === 'undefined') {
    return;
  }
  window.__FOLIOLE_DESKTOP_DEBUG_PROBE__ = {
    getSnapshot
  };
}

export function readDesktopDebugProbe(): DesktopDebugProbeSnapshot | null {
  if (!isDesktopDebugProbeEnabled()) {
    return null;
  }
  return getSnapshot();
}

export function recordDesktopDebugInvokeFailure(entry: { args?: unknown; command: string; error: unknown }) {
  if (!isDesktopDebugProbeEnabled()) {
    return;
  }
  const nextEntry: DesktopDebugInvokeFailure = {
    args: entry.args === undefined ? undefined : cloneValue(entry.args),
    command: entry.command,
    error: toErrorDetails(entry.error),
    timestamp: new Date().toISOString()
  };
  recentInvokeFailures = [nextEntry, ...recentInvokeFailures].slice(0, MAX_RECENT_INVOKE_FAILURES);
}

export function resetDesktopDebugProbeState() {
  recentInvokeFailures = [];
  if (typeof window !== 'undefined') {
    window.__FOLIOLE_DESKTOP_DEBUG_PROBE__ = undefined;
  }
}
