import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeDesktopUpdateState } from '../../../lib/platform/nativeUpdateContract';

import { getElectronAPI } from './electronApi';

const NOT_APPLICABLE_STATE: NativeDesktopUpdateState = { phase: 'not-applicable' };
const IDLE_STATE: NativeDesktopUpdateState = { phase: 'idle' };

let state = IDLE_STATE;
let bridgeSubscriptionInstalled = false;
const subscribers = new Set<() => void>();

function publish(nextState: NativeDesktopUpdateState) {
  state = nextState;
  subscribers.forEach((subscriber) => subscriber());
  return nextState;
}

function ensureBridgeSubscription() {
  if (bridgeSubscriptionInstalled) return;
  bridgeSubscriptionInstalled = true;
  const api = getElectronAPI();
  if (!api?.onDesktopUpdateState) {
    publish(NOT_APPLICABLE_STATE);
    return;
  }
  api.onDesktopUpdateState((nextState) => publish(nextState));
}

async function invokeUpdateCommand(
  command: typeof NATIVE_COMMANDS.desktopUpdateDownload | typeof NATIVE_COMMANDS.desktopUpdateInstall
) {
  ensureBridgeSubscription();
  const api = getElectronAPI();
  if (!api) return publish(NOT_APPLICABLE_STATE);
  try {
    return publish(await api.invoke(command));
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
  ensureBridgeSubscription();
  const api = getElectronAPI();
  if (!api) return publish(NOT_APPLICABLE_STATE);
  try {
    return publish(await api.invoke(NATIVE_COMMANDS.desktopUpdateCheck, { targetVersion }));
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
