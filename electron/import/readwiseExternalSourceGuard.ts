import { canCurrentHostRunReadwise } from '../database/readwiseHostAssignment.js';

export function canRunReadwiseExternalSource(input: { readwiseReaderEnabled?: boolean } = {}) {
  return canCurrentHostRunReadwise() && input.readwiseReaderEnabled !== false;
}
