import { canDesktopRunExternalSources } from '../sync/primaryDeviceState.js';

export function canRunReadwiseExternalSource(input: { readwiseReaderEnabled?: boolean } = {}) {
  return canDesktopRunExternalSources() && input.readwiseReaderEnabled !== false;
}
