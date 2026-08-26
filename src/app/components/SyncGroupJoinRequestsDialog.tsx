import { forwardRef, useState } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { useDesktopSyncGroup } from '../../shared/platform/useDesktopSyncGroup';
import { AppButton, AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../shared/ui';

export function SyncGroupJoinRequestsDialog() {
  const state = useDesktopSyncGroup();
  if (!state.isDesktopRuntime || state.overview.join_requests.length === 0) return null;
  return (
    <AppDialog open>
      <AppDialogPortal>
        <AppDialogOverlay />
        <JoinDialogContent state={state} />
      </AppDialogPortal>
    </AppDialog>
  );
}

const JoinDialogContent = forwardRef<HTMLDivElement, {
  state: ReturnType<typeof useDesktopSyncGroup>;
}>(function JoinDialogContent({ state }, ref) {
  const t = useTranslation();
  const request = state.overview.join_requests[0];
  const [errorMessage, setErrorMessage] = useState('');
  if (!request) return null;
  const disabled = state.pendingActionId === request.request_id;
  const run = async (action: (requestId: string) => Promise<unknown>) => {
    setErrorMessage('');
    try { await action(request.request_id); }
    catch (error) { setErrorMessage(error instanceof Error ? error.message : t('settings.companionSync.error.devicesUnavailable')); }
  };
  return (
    <AppDialogContent aria-describedby={undefined} className="w-[min(460px,calc(100vw-48px))] p-6"
      onEscapeKeyDown={(event) => event.preventDefault()} onPointerDownOutside={(event) => event.preventDefault()} ref={ref}>
      <div className="space-y-5 text-center">
        <AppDialogTitle className="text-base font-semibold text-foreground">
          {t('settings.companionSync.group.join.title')}
        </AppDialogTitle>
        <p className="text-sm text-foreground/65">{t('settings.companionSync.group.join.description')}</p>
        <div className="rounded-xl border border-border bg-bg-subtle px-4 py-4">
          <p className="truncate text-sm font-semibold text-foreground">{request.device_name}</p>
          <p className="mt-1 truncate text-xs text-foreground/55">{request.platform}</p>
        </div>
        <AppButton className="w-full" disabled={disabled} loading={disabled}
          onClick={() => void run(state.acceptRequest)} variant="emphasis">
          {t('settings.companionSync.group.join.approve')}
        </AppButton>
        <AppButton className="w-full" disabled={disabled} onClick={() => void run(state.rejectRequest)} variant="danger">
          {t('settings.companionSync.group.join.reject')}
        </AppButton>
        {errorMessage ? <p className="text-sm text-error" role="alert">{errorMessage}</p> : null}
      </div>
    </AppDialogContent>
  );
});
