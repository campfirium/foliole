import { getElectronAPI } from './electronApi';

export function isDesktopRuntime() {
  return Boolean(getElectronAPI());
}
