import type { WorkspaceNodeSnapshot } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { collectNodeVersionPayloads } from '../../../../../lib/core/sync/nodeVersionPayloadCollector';
import { applySyncNodesWithDbPort } from '../../../../../lib/core/sync/syncNodeApplyExecutor';
import { topicTextSnapshotHash } from '../../../../../lib/core/sync/topicTextSnapshotHash';
import type { NativeSyncNodeRecord } from '../../../../../lib/platform/nativeSyncContract';

import { createCompanionMetadataVersion } from './companionNodeHistory';

export async function saveCompanionDiveDirectoryVersion(db: DbPort, node: WorkspaceNodeSnapshot, hostName: string,
  changes: Partial<Pick<NativeSyncNodeRecord['snapshot'], 'manual_child_order' | 'virtual_filter'>>) {
  const version = await createCompanionMetadataVersion(db, node, hostName);
  version.snapshot = { ...version.snapshot, ...changes };
  version.content_hash = topicTextSnapshotHash(version.snapshot);
  const result = await applySyncNodesWithDbPort(db, [version], {
    enqueueSearchInvalidations: false, operation: 'local_mutation'
  });
  if (!result.appliedIds.includes(node.id) || result.conflictNodes.length) throw new Error('Directory was not saved');
  await collectNodeVersionPayloads(db, node.id, Number.MAX_SAFE_INTEGER);
}
