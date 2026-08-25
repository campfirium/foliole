import {
  evaluateSyncProtocolVersionHint,
  parseSyncProtocolTxt
} from '../../lib/platform/syncProtocolContract.js';

export function evaluateDiscoveredSyncProtocol(txt: Record<string, unknown>) {
  return evaluateSyncProtocolVersionHint(parseSyncProtocolTxt(txt));
}
