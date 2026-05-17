import type { ReactNode } from 'react';

import { AppButton, AppEmptyState, AppErrorState, AppLoadingState } from '../../../shared/ui';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import { ensureWorkspaceHydrated } from '../../../store/workspaceStoreHydration';

interface NodeListStateSurfaceProps {
  children: ReactNode;
  className?: string;
  emptyState: {
    description: string;
    title: string;
  };
  hasRows: boolean;
}

export function useNodeListLoadState() {
  const errorMessage = useWorkspaceStore((state) => state.workspaceHydrationError);
  const isHydrated = useWorkspaceStore((state) => state.isHydrated);
  return { errorMessage, isHydrated };
}

export function NodeListStateSurface({
  children,
  className,
  emptyState,
  hasRows
}: NodeListStateSurfaceProps) {
  const loadState = useNodeListLoadState();

  if (hasRows) {
    return <>{children}</>;
  }

  if (loadState.errorMessage) {
    return (
      <div className={className}>
        <AppErrorState
          action={
            <AppButton onClick={() => void ensureWorkspaceHydrated()} size="sm">
              Retry
            </AppButton>
          }
          description={loadState.errorMessage}
          title="Workspace unavailable"
        />
      </div>
    );
  }

  if (!loadState.isHydrated) {
    return (
      <div className={className}>
        <AppLoadingState />
      </div>
    );
  }

  return (
    <div className={className}>
      <AppEmptyState description={emptyState.description} title={emptyState.title} />
    </div>
  );
}
