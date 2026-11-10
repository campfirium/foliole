import type { Dive } from '../../../lib/core/nodes/dive';
import { getDiveRepository } from '../../shared/platform/desktop/diveRepository';
import { logRuntimeError } from '../../shared/platform/runtimeLogging';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
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

export async function removeWorkspaceDiveSource(diveId: string, sourceId: string, failureMessage: string) {
  const repository = getDiveRepository();
  if (!repository) return;
  try {
    await saveWorkspaceDive(() => repository.remove(diveId, sourceId));
  } catch {
    showAppRuntimeNotice(failureMessage);
  }
}

export async function convertWorkspaceDiveDirectory(nodeId: string, target: 'dive' | 'index', failureMessage: string,
  matchedTopics?: { filter: string; ids: readonly string[] }) {
  const repository = getDiveRepository();
  const { libraryScope } = useWorkspaceStore.getState();
  if (!repository) return;
  try {
    await repository.convert(nodeId, target, matchedTopics);
  } catch {
    showAppRuntimeNotice(failureMessage);
    return;
  }
  if (libraryScope) {
    try {
      await refreshWorkspaceStateWithScope(
        { kind: 'nodes', nodeIds: [nodeId], structure: true }, libraryScope, 'content-changed');
    } catch (error) {
      logRuntimeError('workspace Dive refresh failed', { area: 'persistence', action: 'refresh_workspace', error });
    }
  }
}
