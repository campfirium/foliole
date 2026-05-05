import { useWorkspaceStore } from './workspaceStore';

let workspaceHydrationPromise: Promise<void> | null = null;

function formatWorkspaceHydrationError(error: unknown) {
  return error instanceof Error ? error.message : 'Could not load the workspace.';
}

export function ensureWorkspaceHydrated() {
  if (useWorkspaceStore.getState().isHydrated) {
    return Promise.resolve();
  }
  if (workspaceHydrationPromise) {
    return workspaceHydrationPromise;
  }

  useWorkspaceStore.setState({ workspaceHydrationError: null });
  workspaceHydrationPromise = Promise.resolve(useWorkspaceStore.persist.rehydrate())
    .catch((error) => {
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
