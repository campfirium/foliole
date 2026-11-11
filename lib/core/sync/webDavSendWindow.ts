const SEND_WINDOW_MS = 60_000;

function scheduleWebDavTimer(dueAt: number, send: (signal: AbortSignal) => Promise<unknown>,
  signal: AbortSignal, onStart: (work: Promise<unknown>) => void) {
  const timer = setTimeout(() => onStart(Promise.resolve().then(() => { if (!signal.aborted) return send(signal); })
    .catch(() => undefined)), Math.max(0, dueAt - Date.now()));
  timer.unref?.();
  return timer;
}

/** One window from the first saved mutation, with an initial check for durable pending work. */
export function createWebDavSendWindow() {
  let send: ((signal: AbortSignal) => Promise<unknown>) | undefined;
  let controller: AbortController | undefined;
  let running: Promise<unknown> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dueAt: number | undefined;
  let checkingOnStartup = false;

  function clearTimer() {
    clearTimeout(timer);
    timer = undefined;
  }

  function schedule() {
    if (!send || !controller || timer || running || dueAt === undefined) return;
    timer = scheduleWebDavTimer(dueAt, send, controller.signal, work => {
      timer = undefined;
      dueAt = undefined;
      checkingOnStartup = false;
      running = work.finally(() => {
        running = undefined;
        schedule();
      });
    });
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
      if (checkingOnStartup) clearTimer();
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
        clearTimer();
        if (running) dueAt = Date.now();
        controller?.abort();
        controller = undefined;
      }
    },
    stop() {
      clearTimer();
      send = undefined;
      dueAt = undefined;
      controller?.abort();
      controller = undefined;
    }
  };
}
