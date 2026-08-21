import { runWithDatabaseConnectionOwner } from '../database/connection.js';

import { buildDiscoveryPayload } from './companionLanPayloads.js';

export function loadCompanionLanDiscovery(appVersion: string) {
  return runWithDatabaseConnectionOwner(() => buildDiscoveryPayload(appVersion));
}
