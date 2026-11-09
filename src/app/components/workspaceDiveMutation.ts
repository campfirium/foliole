import type { Dive } from '../../../lib/core/nodes/dive';
import { logRuntimeError } from '../../shared/platform/runtimeLogging';
import { refreshWorkspaceStateWithScope } from '../../store/workspaceRefreshScheduler';
import { useWorkspaceStore } from '../../store/workspaceStore';

export async function saveWorkspaceDive(save: () => Promise<Dive>): Promise<Dive> {
  const { libraryScope } = useWorkspaceStore.getState();
  const dive = await save();
  if (libraryScope) {
    try {
      await refreshWorkspaceStateWithScope({ kind: 'nodes', nodeIds: [dive.id] }, libraryScope, 'content-changed');
    } catch (error) {
      logRuntimeError('workspace Dive refresh failed', { area: 'persistence', action: 'refresh_workspace', error });
    }
  }
  return dive;
}
