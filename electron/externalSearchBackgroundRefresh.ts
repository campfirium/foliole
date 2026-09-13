import { refreshExternalSearchIndexes } from './database/externalSearchCache.js';
import { loadExternalSearchFolders } from './database/externalSearchFolders.js';

const INITIAL_DELAY_MS = 20_000;
const PERIODIC_REFRESH_MS = 15 * 60_000;

interface ExternalSearchBackgroundRefreshController {
  notifyUserActivity(): void;
  pause(): Promise<void>;
  refreshNow(): void;
  start(): void;
  stop(): void;
}

interface ExternalSearchBackgroundRefreshArgs {
  initialDelayMs?: number;
  now?: () => number;
  rebuild?: () => Promise<unknown>;
  refreshIntervalMs?: number;
  userTriggerMinIntervalMs?: number;
  readFolders?: typeof loadExternalSearchFolders;
  scheduleInterval?: typeof globalThis.setInterval;
  scheduleTimeout?: typeof globalThis.setTimeout;
  clearIntervalHandle?: typeof globalThis.clearInterval;
  clearTimeoutHandle?: typeof globalThis.clearTimeout;
}

interface RefreshRuntime {
  disposed: boolean;
  refreshInFlight: Promise<void> | null;
}

function createRefreshRuntime() {
  const runtime: RefreshRuntime = {
    disposed: false,
    refreshInFlight: null
  };
  return runtime;
}

function hasConfiguredFolders(readFolders: typeof loadExternalSearchFolders) {
  return readFolders().length > 0;
}

function createRefreshRunner(args: {
  rebuild: () => Promise<unknown>;
  readFolders: typeof loadExternalSearchFolders;
  runtime: RefreshRuntime;
}) {
  return async function runRefresh() {
    if (args.runtime.disposed || args.runtime.refreshInFlight || !hasConfiguredFolders(args.readFolders)) {
      return args.runtime.refreshInFlight ?? undefined;
    }
    args.runtime.refreshInFlight = Promise.resolve(args.rebuild())
      .catch((error) => {
        console.error('[external-search] background refresh failed', error);
      })
      .then(() => undefined)
      .finally(() => {
        args.runtime.refreshInFlight = null;
      });
    return args.runtime.refreshInFlight;
  };
}

function createTimerHandles() {
  return {
    intervalTimer: null as ReturnType<typeof globalThis.setInterval> | null,
    startupTimer: null as ReturnType<typeof globalThis.setTimeout> | null
  };
}

export function createExternalSearchBackgroundRefreshController(args?: ExternalSearchBackgroundRefreshArgs) {
  const rebuild = args?.rebuild ?? (() => refreshExternalSearchIndexes());
  const readFolders = args?.readFolders ?? loadExternalSearchFolders;
  const initialDelayMs = args?.initialDelayMs ?? INITIAL_DELAY_MS;
  const refreshIntervalMs = args?.refreshIntervalMs ?? PERIODIC_REFRESH_MS;
  const scheduleTimeout = args?.scheduleTimeout ?? globalThis.setTimeout;
  const scheduleInterval = args?.scheduleInterval ?? globalThis.setInterval;
  const clearTimeoutHandle = args?.clearTimeoutHandle ?? globalThis.clearTimeout;
  const clearIntervalHandle = args?.clearIntervalHandle ?? globalThis.clearInterval;
  const runtime = createRefreshRuntime();
  const timers = createTimerHandles();
  const runRefresh = createRefreshRunner({ rebuild, readFolders, runtime });

  return {
    notifyUserActivity() {
      // Focus and clicks are not refresh triggers; timers and directory changes own scheduling.
    },
    async pause() {
      if (timers.startupTimer) {
        clearTimeoutHandle(timers.startupTimer);
        timers.startupTimer = null;
      }
      await runtime.refreshInFlight;
    },
    refreshNow() {
      if (runtime.disposed) {
        return;
      }
      void runRefresh();
    },
    start() {
      if (runtime.disposed || timers.startupTimer || timers.intervalTimer) {
        return;
      }
      timers.startupTimer = scheduleTimeout(() => {
        timers.startupTimer = null;
        void runRefresh();
      }, initialDelayMs);
      timers.intervalTimer = scheduleInterval(() => {
        void runRefresh();
      }, refreshIntervalMs);
    },
    stop() {
      runtime.disposed = true;
      if (timers.startupTimer) {
        clearTimeoutHandle(timers.startupTimer);
        timers.startupTimer = null;
      }
      if (timers.intervalTimer) {
        clearIntervalHandle(timers.intervalTimer);
        timers.intervalTimer = null;
      }
    }
  } satisfies ExternalSearchBackgroundRefreshController;
}
