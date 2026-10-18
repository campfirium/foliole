import type { WorkspaceSnapshot } from '../../../../lib/core/database/workspaceSnapshot.js';
import { WorkspaceSnapshotRefresh, type WorkspaceRefreshScope } from '../../../../lib/core/database/workspaceSnapshotRefresh.js';
import { registerWorkspaceAttachmentResources } from '../runtime/workspaceAttachmentResourceRegistry.js';

import { subscribeCompanionReadingScope } from './reading/companionReadingScope.js';

export const companionWorkspaceSnapshots = new WorkspaceSnapshotRefresh<WorkspaceSnapshot | null>(null);
companionWorkspaceSnapshots.subscribe(() => registerWorkspaceAttachmentResources(companionWorkspaceSnapshots.getSnapshot()));
subscribeCompanionReadingScope(() => companionWorkspaceSnapshots.reset(null));

export function registerCompanionWorkspaceRefresh(scope: WorkspaceRefreshScope) {
  if (scope.kind === 'full' || scope.nodeIds.length || scope.reviewNodeIds?.length || scope.readingNodeIds?.length ||
    scope.openStateNodeIds?.length || scope.activeNode) companionWorkspaceSnapshots.register(scope);
}
