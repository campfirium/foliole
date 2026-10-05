import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { createFramedSyncOutboundStaging } from '../../lib/core/sync/framedSyncOutboundStaging.js';

export function createDesktopFramedSyncOutboundStaging(db: DbPort) {
  return createFramedSyncOutboundStaging(db);
}
