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

type WebDavWork = (signal: AbortSignal, foregroundReceive?: true) => Promise<unknown>;
type ActiveWork = { send: WebDavWork; signal: AbortSignal };

function createWebDavFlight() {
  let mode: 'receive' | 'send' | undefined;
  let checkAfterSend: (() => void) | undefined;
  return {
    get running() { return mode !== undefined; },
    get sending() { return mode === 'send'; },
    afterSend(check: () => void) { if (mode !== 'receive') checkAfterSend = check; },
    clearCheck() { checkAfterSend = undefined; },
    run({ send, signal }: ActiveWork, foregroundReceive: true | undefined,
      update: (error?: unknown) => void, complete: () => void) {
      mode = foregroundReceive ? 'receive' : 'send';
      const finish = (error?: unknown) => { if (!signal.aborted) update(error); };
      void Promise.resolve().then(() => {
        if (!signal.aborted) return foregroundReceive ? send(signal, true) : send(signal);
      }).then(() => finish(), finish).finally(() => {
        mode = undefined;
        const check = checkAfterSend;
        checkAfterSend = undefined;
        check?.();
        complete();
      });
    }
  };
}

function createWebDavSchedule(readActiveWork: () => ActiveWork | undefined) {
  const flight = createWebDavFlight();
  const timer = createWebDavTimer();
  const backoff = createWebDavTransportBackoff(SEND_WINDOW_MS);
  let dueAt: number | undefined;
  let checkingOnStartup = false;

  function run(work: ActiveWork, foregroundReceive?: true) {
    flight.run(work, foregroundReceive, error => {
      backoff.update(error);
      if (!foregroundReceive) dueAt ??= backoff.deadline;
    }, schedule);
  }

  function schedule() {
    const work = readActiveWork();
    if (!work || timer.scheduled || flight.running || dueAt === undefined) return;
    timer.schedule(Math.max(dueAt, backoff.deadline ?? 0), () => {
      dueAt = undefined;
      checkingOnStartup = false;
      run(work);
    }, schedule);
  }

  function checkForeground() {
    const work = readActiveWork();
    const now = Date.now();
    if (!work || (backoff.deadline ?? 0) > now) return;
    if (flight.running || (dueAt !== undefined && dueAt <= now)) {
      flight.afterSend(checkForeground);
      return;
    }
    timer.clear();
    run(work, true);
  }

  return {
    schedule,
    start() {
      checkingOnStartup = true;
      dueAt = Date.now() + SEND_WINDOW_MS;
      schedule();
    },
    request() {
      if (checkingOnStartup) timer.clear();
      if (checkingOnStartup || dueAt === undefined) dueAt = Date.now() + SEND_WINDOW_MS;
      checkingOnStartup = false;
      schedule();
    },
    foreground: checkForeground,
    suspend() {
      flight.clearCheck();
      timer.clear();
      if (flight.sending) dueAt = Date.now();
    },
    stop() {
      flight.clearCheck();
      timer.clear();
      dueAt = undefined;
      backoff.update();
    }
  };
}

export function createWebDavSendWindow() {
  let send: WebDavWork | undefined;
  let controller: AbortController | undefined;
  const schedule = createWebDavSchedule(() => send && controller ? { send, signal: controller.signal } : undefined);

  return {
    start(work: WebDavWork, active = true) {
      if (send) return;
      send = work;
      controller = active ? new AbortController() : undefined;
      schedule.start();
    },
    request() { if (send) schedule.request(); },
    foreground: schedule.foreground,
    setActive(active: boolean) {
      if (!send || active === Boolean(controller)) return;
      if (active) {
        controller = new AbortController();
        schedule.schedule();
      } else {
        schedule.suspend();
        controller?.abort();
        controller = undefined;
      }
    },
    stop() {
      schedule.stop();
      send = undefined;
      controller?.abort();
      controller = undefined;
    }
  };
}
