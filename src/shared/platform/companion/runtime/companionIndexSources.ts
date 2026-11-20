import { loadCompanionWorkspaceNodeFromDb } from '../../../../../lib/core/database/companionWorkspaceNodeRead';
import { isManualVirtualFolderNode } from '../../../../../lib/core/nodes/virtualNodeFilter';
import { canUseManualVirtualFolderSource } from '../../../../../lib/core/nodes/virtualNodeResults';

import { runCompanionHistoryMutation } from './companionFlowHistory';
import { saveCompanionVirtualDirectoryVersion } from './companionVirtualDirectoryVersion';
import { iosCompanionHostName } from './iosCompanionMutationState';

export type CompanionIndexSourceChange = 'add' | 'remove';

export function changeCompanionIndexSource(indexId: string, sourceId: string, change: CompanionIndexSourceChange) {
  return runCompanionHistoryMutation(async db => {
    const index = await loadCompanionWorkspaceNodeFromDb(db, indexId);
    if (!index || index.deletedAt || !isManualVirtualFolderNode(index)) throw new Error('index_unavailable');
    const current = index.manualChildOrder ?? [];
    const present = current.includes(sourceId);
    if (present === (change === 'add')) return;
    if (change === 'add' && !canUseManualVirtualFolderSource(await loadCompanionWorkspaceNodeFromDb(db, sourceId))) {
      throw new Error('index_source_unavailable');
    }
    const next = change === 'add' ? [...current, sourceId] : current.filter(id => id !== sourceId);
    await saveCompanionVirtualDirectoryVersion(db, { ...index, updatedAt: new Date().toISOString() },
      await iosCompanionHostName(db), { manual_child_order: JSON.stringify(next) });
  }, { kind: 'nodes', nodeIds: [indexId], structure: true });
}
