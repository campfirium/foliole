import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { readDiveNode } from '../../lib/core/nodes/dive';
import { resolveDiveMembership } from '../shared/diveMembership';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

import type { useCompanionArticleSurface } from './useCompanionArticleSurface';

export function resolveCompanionDiveStarter(
  snapshot: WorkspaceSnapshot | null,
  openDiveFlow: ReturnType<typeof useCompanionArticleSurface>['openDiveFlow']
) {
  if (!snapshot || !isAvailableNativeCompanionRuntime()) return undefined;
  return (id: string) => {
    const node = snapshot.nodesById[id];
    const dive = readDiveNode(node);
    if (dive && !node?.deletedAt && !snapshot.trashedNodeIds.includes(id)) {
      void openDiveFlow({ id, topicIds: resolveDiveMembership(snapshot, dive).topics });
    }
  };
}
