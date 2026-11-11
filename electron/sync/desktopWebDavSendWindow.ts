export const DESKTOP_WEBDAV_SEND_WINDOW_MS = 60_000;

export function createDesktopWebDavSendWindow() {
  let lifetime: { controller: AbortController; send: (signal: AbortSignal) => Promise<unknown> } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let checkingOnStartup = false;

  function schedule() {
    if (!lifetime || timer) return;
    const { controller: { signal }, send } = lifetime;
    timer = setTimeout(() => {
      timer = undefined;
      checkingOnStartup = false;
      void send(signal).catch(() => undefined);
    }, DESKTOP_WEBDAV_SEND_WINDOW_MS);
    timer.unref?.();
  }

  return {
    start(send: (signal: AbortSignal) => Promise<unknown>) {
      if (lifetime) return;
      lifetime = { controller: new AbortController(), send };
      checkingOnStartup = true;
      schedule();
    },
    request() {
      if (checkingOnStartup) {
        clearTimeout(timer);
        timer = undefined;
        checkingOnStartup = false;
      }
      schedule();
    },
    stop() {
      clearTimeout(timer);
      timer = undefined;
      checkingOnStartup = false;
      lifetime?.controller.abort();
      lifetime = undefined;
    }
  };
}

export const desktopWebDavSendWindow = createDesktopWebDavSendWindow();
