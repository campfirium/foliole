import { parseStoredAnchorLink } from '../../lib/core/database/anchorLinkCodec.js';
import { parseStoredImageRegions } from '../../lib/core/database/imageRegionCodec.js';
import type { UpsertNodeSnapshotOptions } from '../../lib/core/database/nodeMutations.js';
import type {
  UpdateNodeAnchorLinkInput,
  UpsertNodeSnapshotInput
} from '../../lib/core/database/nodeMutations.js';
import { applyParentContentChange } from '../../lib/core/database/parentContentMutation.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';
import {
  updateNodeAnchorLinks,
  upsertNodeSnapshot,
  upsertNodeSnapshotWithOrder
} from './nodeMutations.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { withTransaction } from './transaction.js';

function flushVersion(driver: ReturnType<typeof openDatabaseConnection>['driver'], nodeId: string, hostName: string, now: string, versionId?: string) {
  return flushNodeSyncVersionWithDriver(driver, nodeId, hostName, now, versionId);
}

export function upsertVersionedNodeSnapshot(
  input: UpsertNodeSnapshotInput,
  options: UpsertNodeSnapshotOptions = {}
) {
  const driver = openDatabaseConnection().driver;
  const hostName = loadOrCreateDesktopHostName(input.updatedAt);
  return withTransaction(driver, () => {
    upsertNodeSnapshot(input, options);
    return flushVersion(driver, input.nodeId, hostName, input.updatedAt);
  });
}

export function upsertVersionedNodeSnapshotWithOrder(input: UpsertNodeSnapshotInput, nodeOrder: string[]) {
  const driver = openDatabaseConnection().driver;
  const hostName = loadOrCreateDesktopHostName(input.updatedAt);
  return withTransaction(driver, () => {
    upsertNodeSnapshotWithOrder(input, nodeOrder);
    return flushVersion(driver, input.nodeId, hostName, input.updatedAt);
  });
}

export function upsertVersionedNodeContentWithAnchors(
  parent: UpsertNodeSnapshotInput,
  affectedAnchors: UpdateNodeAnchorLinkInput[],
  options: UpsertNodeSnapshotOptions & { versionId?: string } = {}
) {
  const driver = openDatabaseConnection().driver;
  const hostName = loadOrCreateDesktopHostName(parent.updatedAt);
  return withTransaction(driver, () => {
    const contentChange = applyParentContentChange({
      driver,
      nextContent: parent.content,
      nodeId: parent.nodeId,
      title: parent.title,
      updatedAt: parent.updatedAt
    });
    upsertNodeSnapshot(parent, options);
    updateNodeAnchorLinks(affectedAnchors);
    flushVersion(driver, parent.nodeId, hostName, parent.updatedAt, options.versionId);
    const anchorIds = [...new Set([
      ...contentChange.affectedChildIds,
      ...affectedAnchors.map((anchor) => anchor.nodeId)
    ])];
    for (const nodeId of anchorIds) {
      driver.execute(
        `UPDATE nodes SET last_modified_by_host_name = ?, sync_dirty = 1 WHERE id = ?`,
        [hostName, nodeId]
      );
      flushVersion(driver, nodeId, hostName, parent.updatedAt);
    }
    return anchorIds.flatMap((nodeId) => {
      const row = driver.queryOne<{
        anchor_link: string | null;
        image_regions: string | null;
        updated_at: string;
      }>('SELECT anchor_link, image_regions, updated_at FROM nodes WHERE id = ?', [nodeId]);
      const anchorLink = parseStoredAnchorLink(row?.anchor_link ?? null);
      if (!row || !anchorLink) return [];
      return [{
        anchorLink: anchorLink as UpdateNodeAnchorLinkInput['anchorLink'],
        imageRegions: parseStoredImageRegions(row.image_regions),
        nodeId,
        updatedAt: row.updated_at
      }];
    });
  });
}
