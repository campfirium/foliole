import { getElectronAPI } from './electronApi';

export function hasRuntimeDebugBridge() {
  return Boolean(getElectronAPI()?.debug);
}
