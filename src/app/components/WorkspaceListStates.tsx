import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton, AppEmptyState, AppErrorState, AppLoadingState } from '../../shared/ui';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { ensureWorkspaceHydrated } from '../../store/workspaceStoreHydration';

export function WorkspaceListLoadingState() {
  const t = useTranslation();
  const hydrationError = useWorkspaceStore((state) => state.workspaceHydrationError);
  if (hydrationError) {
    return (
      <aside
        aria-label={t('desktop.workspaceList.error')}
        className="workspace-region-main-folder flex min-h-0 min-w-0 flex-1 items-center justify-center px-6"
      >
        <AppErrorState
          action={
            <AppButton onClick={() => void ensureWorkspaceHydrated()} size="sm">
              {t('desktop.nodeList.retry')}
            </AppButton>
          }
          description={hydrationError}
          title={t('desktop.nodeList.workspaceUnavailable')}
        />
      </aside>
    );
  }

  return (
    <aside
      aria-busy="true"
      aria-label={t('desktop.workspaceList.progress')}
      className="workspace-region-main-folder flex min-h-0 min-w-0 flex-1 items-center justify-center px-6"
    >
      <AppLoadingState />
    </aside>
  );
}

export function WorkspaceListEmptyState() {
  const t = useTranslation();
  return (
    <aside aria-label={t('desktop.workspaceList.topicPanel')} className="workspace-region-main-folder flex min-h-0 flex-1 flex-col text-foreground">
      <div className="flex min-h-[40px] items-center justify-end gap-2 px-3">
        <div className="h-8 w-8 rounded-sm bg-foreground/[0.05]" />
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-8">
        <AppEmptyState
          description={t('desktop.workspaceList.empty.description')}
          title={t('desktop.workspaceList.empty.title')}
        />
      </div>
    </aside>
  );
}
