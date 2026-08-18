import { canCurrentDeviceRunReadwise } from '../database/readwiseDeviceAssignment.js';
import { canDesktopRunExternalSources } from '../sync/primaryDeviceState.js';

export function canRunReadwiseExternalSource(input: { readwiseReaderEnabled?: boolean } = {}) {
  return canDesktopRunExternalSources() && canCurrentDeviceRunReadwise() && input.readwiseReaderEnabled !== false;
}
