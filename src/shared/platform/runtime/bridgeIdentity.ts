import { getElectronAPI } from '../electronApi';

/**
 * Identity of the current host bridge, for callers that scope in-memory state per bridge
 * instance (e.g. a WeakMap key). Exposes no capabilities; null when no bridge is installed.
 */
export function getRuntimeBridgeIdentity(): object | null {
  return getElectronAPI();
}
