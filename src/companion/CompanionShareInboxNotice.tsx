import type { ReactNode } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppButton, appShelllessSurfaceClassName } from '../shared/ui';

import { useCompanionShareInbox } from './useCompanionShareInbox';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

export function CompanionShareInboxNotice(props: {
  children: ReactNode;
  workspaceSync: ReturnType<typeof useCompanionWorkspaceSync>;
}) {
  const t = useTranslation();
  const share = useCompanionShareInbox(props.workspaceSync);
  return <>
    {props.children}
    {share.failed ? (
      <div className="pointer-events-none fixed inset-0 z-workspace-overlay flex items-center justify-center px-6">
        <div className={appShelllessSurfaceClassName('pointer-events-auto flex max-w-sm flex-col gap-3 px-4 py-3 text-ui-md')}>
          <p role="alert">{t('companion.share.incomplete')}</p>
          <div className="flex justify-end gap-2">
            <AppButton onClick={share.dismiss} variant="ghost">{t('companion.capture.close')}</AppButton>
            <AppButton disabled={share.pending} onClick={share.retry} variant="subtle">{t('companion.app.retry')}</AppButton>
          </div>
        </div>
      </div>
    ) : null}
  </>;
}
