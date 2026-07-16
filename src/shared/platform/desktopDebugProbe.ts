import { getElectronAPI } from './electronApi';

const MAX_RECENT_INVOKE_FAILURES = 5;
const MAX_RECENT_INVOKES = 20;

export type DesktopDebugInvokeStatus = 'resolved' | 'rejected';

interface DesktopDebugInvokeRecord {
  args?: unknown;
  command: string;
  durationMs: number;
  error?: {
    message: string;
    name?: string;
  };
  status: DesktopDebugInvokeStatus;
  timestamp: string;
}

interface DesktopDebugInvokeFailure {
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
  preloadPath: string | null;
  recentInvokes: DesktopDebugInvokeRecord[];
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
let recentInvokes: DesktopDebugInvokeRecord[] = [];

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

function getPreloadPath() {
  return getElectronAPI()?.debug?.preloadPath ?? null;
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

function cloneArgs(args: unknown) {
  if (args === undefined) {
    return undefined;
  }
  return cloneValue(args);
}

function cloneFailureArgs(args: unknown) {
  return cloneArgs(args);
}

function getSnapshot(): DesktopDebugProbeSnapshot {
  return {
    bridgeAvailable: Boolean(getElectronAPI()),
    preloadPath: getPreloadPath(),
    recentInvokes: recentInvokes.map((entry) => cloneValue(entry)),
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

export function recordDesktopDebugInvoke(entry: {
  args?: unknown;
  command: string;
  durationMs: number;
  error?: unknown;
  status: DesktopDebugInvokeStatus;
}) {
  if (!isDesktopDebugProbeEnabled()) {
    return;
  }
  const nextEntry: DesktopDebugInvokeRecord = {
    command: entry.command,
    durationMs: entry.durationMs,
    ...(entry.error !== undefined ? { error: toErrorDetails(entry.error) } : {}),
    ...(entry.status === 'rejected' && entry.args !== undefined ? { args: cloneFailureArgs(entry.args) } : {}),
    status: entry.status,
    timestamp: new Date().toISOString()
  };
  recentInvokes = [nextEntry, ...recentInvokes].slice(0, MAX_RECENT_INVOKES);
}

export function recordDesktopDebugInvokeFailure(entry: { args?: unknown; command: string; error: unknown }) {
  if (!isDesktopDebugProbeEnabled()) {
    return;
  }
  const nextEntry: DesktopDebugInvokeFailure = {
    command: entry.command,
    error: toErrorDetails(entry.error),
    ...(entry.args !== undefined ? { args: cloneFailureArgs(entry.args) } : {}),
    timestamp: new Date().toISOString()
  };
  recentInvokeFailures = [nextEntry, ...recentInvokeFailures].slice(0, MAX_RECENT_INVOKE_FAILURES);
}

export function resetDesktopDebugProbeState() {
  recentInvokeFailures = [];
  recentInvokes = [];
  if (typeof window !== 'undefined') {
    delete window.__FOLIOLE_DESKTOP_DEBUG_PROBE__;
  }
}
