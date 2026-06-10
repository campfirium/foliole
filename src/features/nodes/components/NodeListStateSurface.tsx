import type { ReactNode } from 'react';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppButton, AppEmptyState, AppErrorState, AppLoadingState } from '../../../shared/ui';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import { ensureWorkspaceHydrated } from '../../../store/workspaceStoreHydration';

interface NodeListStateSurfaceProps {
  children: ReactNode;
  className?: string;
  emptyState?: {
    description: string;
    title: string;
  };
  hasRows: boolean;
}

function useNodeListLoadState() {
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
  const t = useTranslation();
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
              {t('desktop.nodeList.retry')}
            </AppButton>
          }
          description={loadState.errorMessage}
          title={t('desktop.nodeList.workspaceUnavailable')}
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

  if (!emptyState) {
    return <div aria-hidden="true" className={className} />;
  }

  return (
    <div className={className}>
      <AppEmptyState description={emptyState.description} title={emptyState.title} />
    </div>
  );
}
