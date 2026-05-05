import { AppButton, AppEmptyState, AppErrorState, AppLoadingState } from '../../shared/ui';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { ensureWorkspaceHydrated } from '../../store/workspaceStoreHydration';

export function WorkspaceListLoadingState() {
  const hydrationError = useWorkspaceStore((state) => state.workspaceHydrationError);
  if (hydrationError) {
    return (
      <aside
        aria-label="Workspace list error"
        className="workspace-region-main-folder flex min-h-0 min-w-0 flex-1 items-center justify-center px-6"
      >
        <AppErrorState
          action={
            <AppButton onClick={() => void ensureWorkspaceHydrated()} size="sm">
              Retry
            </AppButton>
          }
          description={hydrationError}
          title="Workspace unavailable"
        />
      </aside>
    );
  }

  return (
    <aside
      aria-busy="true"
      aria-label="Loading workspace list"
      className="workspace-region-main-folder flex min-h-0 min-w-0 flex-1 items-center justify-center px-6"
    >
      <AppLoadingState description="Loading topics and folders." title="Loading workspace" />
    </aside>
  );
}

export function WorkspaceListEmptyState() {
  return (
    <aside aria-label="Topic list panel" className="workspace-region-main-folder flex min-h-0 flex-1 flex-col text-foreground">
      <div className="flex min-h-[40px] items-center justify-end gap-2 px-3">
        <div className="h-8 w-8 rounded-sm bg-foreground/[0.05]" />
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-8">
        <AppEmptyState
          description="Create your first document or folder from the list toolbar to start building the workspace."
          title="Nothing here yet"
        />
      </div>
    </aside>
  );
}
