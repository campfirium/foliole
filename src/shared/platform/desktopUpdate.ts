import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeDesktopUpdateState } from '../../../lib/platform/nativeUpdateContract';

import { getElectronAPI } from './electronApi';

const NOT_APPLICABLE_STATE: NativeDesktopUpdateState = { phase: 'not-applicable' };
const IDLE_STATE: NativeDesktopUpdateState = { phase: 'idle' };
const RESTART_FEEDBACK_READABILITY_MS = 1000;

let state = IDLE_STATE;
let restartFeedbackState: NativeDesktopUpdateState | null = null;
let publicationRevision = 0;
let bridgeSubscriptionInstalled = false;
let hydrationPromise: Promise<NativeDesktopUpdateState> | null = null;
const subscribers = new Set<() => void>();

function publish(nextState: NativeDesktopUpdateState) {
  publicationRevision += 1;
  // The main process is still ready for this version while restart feedback paints.
  if (state === restartFeedbackState && nextState.phase === 'ready' && nextState.version === state.version) return state;
  state = nextState;
  subscribers.forEach((subscriber) => subscriber());
  return nextState;
}

function ensureBridgeSubscription() {
  if (bridgeSubscriptionInstalled) return hydrationPromise ?? Promise.resolve(state);
  bridgeSubscriptionInstalled = true;
  const api = getElectronAPI();
  if (!api?.onDesktopUpdateState) {
    return Promise.resolve(publish(NOT_APPLICABLE_STATE));
  }
  api.onDesktopUpdateState((nextState) => publish(nextState));
  const revision = publicationRevision;
  hydrationPromise = api.invoke(NATIVE_COMMANDS.desktopUpdateCheck, { targetVersion: '' })
    .then((nextState) => revision === publicationRevision ? publish(nextState) : state)
    .catch(() => publish({ errorCode: 'check-failed', phase: 'error' }));
  return hydrationPromise;
}

async function invokeUpdateCommand(
  ...request: [typeof NATIVE_COMMANDS.desktopUpdateDownload]
    | [typeof NATIVE_COMMANDS.desktopUpdateInstall, { targetVersion: string }]
) {
  await ensureBridgeSubscription();
  const api = getElectronAPI();
  if (!api) return publish(NOT_APPLICABLE_STATE);
  const revision = publicationRevision;
  try {
    const [command, args] = request;
    const nextState = command === NATIVE_COMMANDS.desktopUpdateInstall
      ? await api.invoke(command, args)
      : await api.invoke(command);
    return revision === publicationRevision ? publish(nextState) : state;
  } catch {
    return publish({ errorCode: 'invalid-command-state', phase: 'error', version: state.version });
  }
}

export function readDesktopUpdateState() {
  ensureBridgeSubscription();
  return state;
}

export function subscribeDesktopUpdateState(subscriber: () => void) {
  ensureBridgeSubscription();
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}

export async function checkDesktopUpdate(targetVersion: string) {
  await ensureBridgeSubscription();
  const api = getElectronAPI();
  if (!api) return publish(NOT_APPLICABLE_STATE);
  const revision = publicationRevision;
  try {
    const nextState = await api.invoke(NATIVE_COMMANDS.desktopUpdateCheck, { targetVersion });
    return revision === publicationRevision ? publish(nextState) : state;
  } catch {
    return publish({ errorCode: 'check-failed', phase: 'error', version: targetVersion });
  }
}

export function downloadDesktopUpdate() {
  return invokeUpdateCommand(NATIVE_COMMANDS.desktopUpdateDownload);
}

function waitForRestartFeedbackPaint() {
  if (typeof window.requestAnimationFrame !== 'function') {
    return new Promise<void>((resolve) => window.setTimeout(resolve, RESTART_FEEDBACK_READABILITY_MS));
  }
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      window.setTimeout(resolve, RESTART_FEEDBACK_READABILITY_MS);
    }));
  });
}

export async function installDesktopUpdate(targetVersion: string) {
  if (state.phase !== 'ready' || state.version !== targetVersion) return state;
  const restarting: NativeDesktopUpdateState = { ...state, errorCode: undefined, phase: 'restarting' };
  restartFeedbackState = restarting;
  publish(restarting);
  await waitForRestartFeedbackPaint();
  if (restartFeedbackState === restarting) restartFeedbackState = null;
  if (state !== restarting) return state;
  return invokeUpdateCommand(NATIVE_COMMANDS.desktopUpdateInstall, { targetVersion });
}
