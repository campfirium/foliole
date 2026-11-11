import { createWebDavTransportBackoff } from './webDavTransportRetry.js';

const SEND_WINDOW_MS = 60_000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;

function createWebDavTimer() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    get scheduled() { return timer !== undefined; },
    clear() {
      clearTimeout(timer);
      timer = undefined;
    },
    schedule(dueAt: number, run: () => void, recheck: () => void) {
      timer = setTimeout(() => {
        timer = undefined;
        if (Date.now() < dueAt) recheck();
        else run();
      }, Math.min(MAX_TIMER_DELAY_MS, Math.max(0, dueAt - Date.now())));
      timer.unref?.();
    }
  };
}

function createWebDavFlight() {
  let running = false;
  return {
    get running() { return running; },
    run(send: (signal: AbortSignal) => Promise<unknown>, signal: AbortSignal,
      update: (error?: unknown) => void, complete: () => void) {
      running = true;
      const finish = (error?: unknown) => { if (!signal.aborted) update(error); };
      void Promise.resolve().then(() => {
        if (!signal.aborted) return send(signal);
      }).then(() => finish(), finish).finally(() => {
        running = false;
        complete();
      });
    }
  };
}

/** One window from the first saved mutation, with an initial check for durable pending work. */
export function createWebDavSendWindow() {
  let send: ((signal: AbortSignal) => Promise<unknown>) | undefined;
  let controller: AbortController | undefined;
  const flight = createWebDavFlight();
  const timer = createWebDavTimer();
  let dueAt: number | undefined;
  let checkingOnStartup = false;
  const backoff = createWebDavTransportBackoff(SEND_WINDOW_MS);

  function schedule() {
    if (!send || !controller || timer.scheduled || flight.running || dueAt === undefined) return;
    const { signal } = controller;
    const attempt = send;
    timer.schedule(Math.max(dueAt, backoff.deadline ?? 0), () => {
      dueAt = undefined;
      checkingOnStartup = false;
      flight.run(attempt, signal, error => {
        backoff.update(error);
        dueAt ??= backoff.deadline;
      }, schedule);
    }, schedule);
  }

  return {
    start(work: (signal: AbortSignal) => Promise<unknown>, active = true) {
      if (send) return;
      send = work;
      controller = active ? new AbortController() : undefined;
      checkingOnStartup = true;
      dueAt = Date.now() + SEND_WINDOW_MS;
      schedule();
    },
    request() {
      if (!send) return;
      if (checkingOnStartup) timer.clear();
      if (checkingOnStartup || dueAt === undefined) dueAt = Date.now() + SEND_WINDOW_MS;
      checkingOnStartup = false;
      schedule();
    },
    setActive(active: boolean) {
      if (!send || active === Boolean(controller)) return;
      if (active) {
        controller = new AbortController();
        schedule();
      } else {
        timer.clear();
        if (flight.running) dueAt = Date.now();
        controller?.abort();
        controller = undefined;
      }
    },
    stop() {
      timer.clear();
      send = undefined;
      dueAt = undefined;
      backoff.update();
      controller?.abort();
      controller = undefined;
    }
  };
}
