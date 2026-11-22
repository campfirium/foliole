import type { WorkspaceNodeSnapshot } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { applyLocalNodeVersionsWithDbPort } from '../../../../../lib/core/sync/localNodeVersionApply';
import { topicTextSnapshotHash } from '../../../../../lib/core/sync/topicTextSnapshotHash';
import type { NativeSyncNodeRecord } from '../../../../../lib/platform/nativeSyncContract';

import { createCompanionMetadataVersion, scheduleCompanionNodeVersionCollection } from './companionNodeHistory';

export async function saveCompanionVirtualDirectoryVersion(db: DbPort, node: WorkspaceNodeSnapshot, hostName: string,
  changes: Partial<Pick<NativeSyncNodeRecord['snapshot'], 'manual_child_order' | 'virtual_filter'>>) {
  const version = await createCompanionMetadataVersion(db, node, hostName);
  version.snapshot = { ...version.snapshot, ...changes };
  version.content_hash = topicTextSnapshotHash(version.snapshot);
  const result = await applyLocalNodeVersionsWithDbPort(db, [version], 'local_mutation');
  if (!result.appliedIds.includes(node.id) || result.conflictNodes.length) throw new Error('Directory was not saved');
  // Superseded bodies are released after the edit settles, as for every local edit.
  scheduleCompanionNodeVersionCollection([node.id]);
}
