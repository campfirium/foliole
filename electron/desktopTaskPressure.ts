const PRESSURE_DRIFT_MS = 50;
const STABLE_SAMPLE_COUNT = 3;

let pressured = false;
let stableSamples = 0;
const reliefListeners = new Set<() => void>();

export function reportDesktopTaskResponsiveness(driftMs: number) {
  if (driftMs > PRESSURE_DRIFT_MS) {
    pressured = true;
    stableSamples = 0;
    return;
  }
  if (!pressured) return;
  stableSamples += 1;
  if (stableSamples < STABLE_SAMPLE_COUNT) return;
  pressured = false;
  stableSamples = 0;
  for (const listener of reliefListeners) listener();
  reliefListeners.clear();
}

export function isDesktopTaskUnderPressure() {
  return pressured;
}

export function waitForDesktopTaskPressureRelief(signal: AbortSignal) {
  if (!pressured) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const onRelief = () => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    };
    const onAbort = () => {
      reliefListeners.delete(onRelief);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    reliefListeners.add(onRelief);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export function resetDesktopTaskPressureForTests() {
  pressured = false;
  stableSamples = 0;
  reliefListeners.clear();
}
