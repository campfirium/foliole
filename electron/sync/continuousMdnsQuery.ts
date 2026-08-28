const INITIAL_QUERY_DELAY_MS = 1_000;
const MAX_QUERY_DELAY_MS = 60 * 60_000;

type MdnsBrowser<Service> = {
  services: Service[];
  update(): void;
};

type TimerApi = {
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => void;
  setTimeout: typeof setTimeout;
};

export function maintainContinuousMdnsQuery<Service>(
  browser: MdnsBrowser<Service>,
  isRelevant: (service: Service) => boolean = () => true,
  timerApi: TimerApi = { clearTimeout, setTimeout }
) {
  let delayMs = INITIAL_QUERY_DELAY_MS;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = () => {
    timer = timerApi.setTimeout(() => {
      timer = null;
      if (stopped) return;
      if (!browser.services.some(isRelevant)) browser.update();
      delayMs = Math.min(delayMs * 2, MAX_QUERY_DELAY_MS);
      schedule();
    }, delayMs);
  };
  const refresh = () => {
    if (stopped) return;
    if (timer) timerApi.clearTimeout(timer);
    delayMs = INITIAL_QUERY_DELAY_MS;
    browser.update();
    schedule();
  };
  const stop = () => {
    stopped = true;
    if (timer) timerApi.clearTimeout(timer);
    timer = null;
  };

  schedule();
  return { refresh, stop };
}
