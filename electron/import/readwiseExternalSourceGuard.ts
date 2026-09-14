import { canCurrentHostRunReadwise } from '../database/readwiseHostAssignment.js';

export function canRunReadwiseExternalSource(input: { readwiseReaderEnabled?: boolean } = {}) {
  return canCurrentHostRunReadwise('relay') && input.readwiseReaderEnabled !== false;
}
