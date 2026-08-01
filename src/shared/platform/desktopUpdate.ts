import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeDesktopUpdateState } from '../../../lib/platform/nativeUpdateContract';

import { getElectronAPI } from './electronApi';

const NOT_APPLICABLE_STATE: NativeDesktopUpdateState = { phase: 'not-applicable' };
const IDLE_STATE: NativeDesktopUpdateState = { phase: 'idle' };

let state = IDLE_STATE;
let publicationRevision = 0;
let bridgeSubscriptionInstalled = false;
let hydrationPromise: Promise<NativeDesktopUpdateState> | null = null;
const subscribers = new Set<() => void>();

function publish(nextState: NativeDesktopUpdateState) {
  state = nextState;
  publicationRevision += 1;
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
  command: typeof NATIVE_COMMANDS.desktopUpdateDownload | typeof NATIVE_COMMANDS.desktopUpdateInstall
) {
  await ensureBridgeSubscription();
  const api = getElectronAPI();
  if (!api) return publish(NOT_APPLICABLE_STATE);
  const revision = publicationRevision;
  try {
    const nextState = await api.invoke(command);
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

export function installDesktopUpdate() {
  return invokeUpdateCommand(NATIVE_COMMANDS.desktopUpdateInstall);
}
