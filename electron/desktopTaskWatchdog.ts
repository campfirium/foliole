import { appendBootEvent } from './ipc/boot.js';

interface DesktopTaskWatchdogArgs {
  appendEvent?: typeof appendBootEvent;
  intervalMs?: number;
  minDriftMs?: number;
  now?: () => number;
  scheduleInterval?: typeof globalThis.setInterval;
}

interface DesktopTaskWatchdogHandle {
  stop: () => void;
}

const DEFAULT_INTERVAL_MS = 250;
const DEFAULT_MIN_DRIFT_MS = 1000;

export function startDesktopTaskWatchdog(args: DesktopTaskWatchdogArgs = {}): DesktopTaskWatchdogHandle {
  const appendEvent = args.appendEvent ?? appendBootEvent;
  const intervalMs = args.intervalMs ?? DEFAULT_INTERVAL_MS;
  const minDriftMs = args.minDriftMs ?? DEFAULT_MIN_DRIFT_MS;
  const now = args.now ?? Date.now;
  const scheduleInterval = args.scheduleInterval ?? globalThis.setInterval;
  let lastTickAt = now();
  let wroteFirstSample = false;
  const timer = scheduleInterval(() => {
    const tickAt = now();
    const driftMs = Math.max(0, tickAt - lastTickAt - intervalMs);
    lastTickAt = tickAt;
    if (wroteFirstSample && driftMs < minDriftMs) {
      return;
    }
    wroteFirstSample = true;
    void appendEvent('app_responsive', { driftMs, intervalMs }).catch((error) => {
      console.error('[desktop-task] watchdog boot event failed', error);
    });
  }, intervalMs);

  return {
    stop() {
      clearInterval(timer);
    }
  };
}
