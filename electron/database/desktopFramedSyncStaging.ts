import type { DbPort } from '../../lib/core/sync/dbPort.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';

import { createDesktopFramedSyncBlobStaging } from './desktopFramedSyncBlobStaging.js';
import { createDesktopFramedSyncInboundStaging } from './desktopFramedSyncInboundStaging.js';
import { createDesktopFramedSyncOutboundStaging } from './desktopFramedSyncOutboundStaging.js';
import {
  createDesktopFramedSyncReceiptStaging,
  type DesktopFramedSyncTerminationPort
} from './desktopFramedSyncReceiptStaging.js';

export type DesktopFramedSyncStagingPort = FramedSyncStagingPort & DesktopFramedSyncTerminationPort;

export function createDesktopFramedSyncStaging(db: DbPort): DesktopFramedSyncStagingPort {
  return {
    ...createDesktopFramedSyncOutboundStaging(db),
    ...createDesktopFramedSyncInboundStaging(db),
    ...createDesktopFramedSyncBlobStaging(db),
    ...createDesktopFramedSyncReceiptStaging(db)
  };
}
