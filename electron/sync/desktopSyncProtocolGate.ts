import {
  evaluateSyncProtocolCompatibility,
  parseSyncProtocolTxt
} from '../../lib/platform/syncProtocolContract.js';

export function evaluateDiscoveredSyncProtocol(txt: Record<string, unknown>) {
  return evaluateSyncProtocolCompatibility(parseSyncProtocolTxt(txt));
}
