import { canCurrentDeviceRunReadwise } from '../database/readwiseDeviceAssignment.js';

export function canRunReadwiseExternalSource(input: { readwiseReaderEnabled?: boolean } = {}) {
  return canCurrentDeviceRunReadwise() && input.readwiseReaderEnabled !== false;
}
