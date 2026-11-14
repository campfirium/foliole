import { isDesktopRuntime } from '../../../shared/platform/runtime';
import { resolveRuntimeOperatingSystem } from '../../../shared/platform/runtime/operatingSystem';

export const QUIT_ON_CLOSE_SEARCH_ROW_ID = 'general-quit-on-close';

export function canShowQuitOnClose(previewDesktopSettings: boolean) {
  return !previewDesktopSettings && isDesktopRuntime() && resolveRuntimeOperatingSystem() !== 'other';
}
