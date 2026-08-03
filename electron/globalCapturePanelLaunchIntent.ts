export const GLOBAL_CAPTURE_PANEL_LAUNCH_ARG = '--global-capture-panel';

const GLOBAL_CAPTURE_PANEL_DATA_KEY = 'globalCapturePanel';

type ShowCapturePanel = () => Promise<unknown>;

function hasLaunchArg(argv: readonly string[]) {
  return argv.includes(GLOBAL_CAPTURE_PANEL_LAUNCH_ARG);
}

function hasLaunchData(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return (value as Record<string, unknown>)[GLOBAL_CAPTURE_PANEL_DATA_KEY] === true;
}

async function showExistingCapturePanel() {
  const { showGlobalCapturePanel } = await import('./globalCapturePanel.js');
  return showGlobalCapturePanel();
}

export function createGlobalCapturePanelSingleInstanceData(argv: readonly string[]) {
  return { [GLOBAL_CAPTURE_PANEL_DATA_KEY]: hasLaunchArg(argv) };
}

export function createGlobalCapturePanelLaunchIntent(
  initialArgv: readonly string[],
  showCapturePanel: ShowCapturePanel = showExistingCapturePanel
) {
  const initialIntent = hasLaunchArg(initialArgv);
  let ready = false;
  let pending = initialIntent;
  let showing = false;

  const flush = async () => {
    if (!ready || !pending || showing) return;
    pending = false;
    showing = true;
    try {
      await showCapturePanel();
    } finally {
      showing = false;
      if (pending) void flush();
    }
  };

  return {
    hasInitialIntent: initialIntent,
    markReady() {
      ready = true;
      void flush();
    },
    request(argv: readonly string[], additionalData?: unknown) {
      if (!hasLaunchArg(argv) && !hasLaunchData(additionalData)) return false;
      pending = true;
      void flush();
      return true;
    }
  };
}
