import { remapRawStoredAnchorLink } from '../../../../../lib/core/database/storedAnchorLinkRemap';
import type { DbPort, DbRow } from '../../../../../lib/core/sync/dbPort';
import { createOpaqueVersionRef } from '../../../../../lib/core/sync/opaqueSyncRefs';
import { applySyncNodesWithDbPort } from '../../../../../lib/core/sync/syncNodeApplyExecutor';
import { loadCurrentSyncNodeRecord } from '../../../../../lib/core/sync/syncNodeGraph';
import { hashText } from '../../../../../lib/core/sync/syncNodeResolution';
import { createCompanionUuid } from '../../companionUuid';

interface ChildAnchor extends DbRow {
  id: string;
  anchor_link: string;
  image_regions: string | null;
}

export function readCompanionContentAnchors(db: DbPort, nodeId: string) {
  return db.query<ChildAnchor>(
    'SELECT id, anchor_link, image_regions FROM nodes WHERE parent_id = ? AND deleted_at IS NULL AND anchor_link IS NOT NULL',
    [nodeId]
  );
}

export async function remapCompanionContentAnchors(args: {
  db: DbPort;
  children: ChildAnchor[];
  previousContent: string;
  nextContent: string;
  hostName: string;
  updatedAt: string;
}) {
  if (args.previousContent === args.nextContent) return;
  for (const child of args.children) {
    const remapped = remapRawStoredAnchorLink({
      value: child.anchor_link, imageRegions: child.image_regions,
      previousContent: args.previousContent, nextContent: args.nextContent
    });
    if (!('value' in remapped)) continue;
    if (remapped.value === child.anchor_link && remapped.imageRegions === child.image_regions) continue;
    const base = await loadCurrentSyncNodeRecord(args.db, child.id, false);
    if (!base?.version_id) throw new Error('Topic edit anchor remap requires synced child base versions.');
    const snapshot = { ...base.snapshot, anchor_link: remapped.value,
      image_regions: remapped.imageRegions, updated_at: args.updatedAt };
    const result = await applySyncNodesWithDbPort(args.db, [{
      ...base, snapshot, content_hash: hashText(JSON.stringify(snapshot)),
      ancestor_version_ids: [base.version_id], parent_version_id: base.version_id,
      parent_version_ids: [base.version_id], version_id: createOpaqueVersionRef(createCompanionUuid()),
      host_name: args.hostName, updated_at: args.updatedAt, version_created_at: args.updatedAt
    }], { operation: 'local_mutation', enqueueSearchInvalidations: false });
    if (result.conflictNodes.length || result.blockedIds.length || result.tombstoneBlockedIds.length) {
      throw new Error('content_edit_anchor_remap_failed');
    }
  }
}
