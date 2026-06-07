import { reportWorkspaceHydrateBootStage } from './workspaceHydrateBootTelemetry';
import { useWorkspaceStore } from './workspaceStore';

let workspaceHydrationPromise: Promise<void> | null = null;

function formatWorkspaceHydrationError(error: unknown) {
  return error instanceof Error ? error.message : 'Could not load the workspace.';
}

export function ensureWorkspaceHydrated() {
  if (useWorkspaceStore.getState().isHydrated) {
    reportWorkspaceHydrateBootStage('skipped_already_hydrated');
    return Promise.resolve();
  }
  if (workspaceHydrationPromise) {
    reportWorkspaceHydrateBootStage('joined_existing');
    return workspaceHydrationPromise;
  }

  reportWorkspaceHydrateBootStage('requested');
  useWorkspaceStore.setState({ workspaceHydrationError: null });
  workspaceHydrationPromise = Promise.resolve(useWorkspaceStore.persist.rehydrate())
    .then(() => {
      reportWorkspaceHydrateBootStage('resolved');
    })
    .catch((error) => {
      reportWorkspaceHydrateBootStage('rejected', {
        message: formatWorkspaceHydrationError(error)
      });
      useWorkspaceStore.setState({
        isHydrated: false,
        workspaceHydrationError: formatWorkspaceHydrationError(error)
      });
      throw error;
    })
    .finally(() => {
      workspaceHydrationPromise = null;
    });
  return workspaceHydrationPromise;
}
