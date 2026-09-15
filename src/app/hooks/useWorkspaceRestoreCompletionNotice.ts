import { useEffect } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { consumeWorkspaceRestoreCompletion } from '../../store/workspaceRestoreSession';

export function useWorkspaceRestoreCompletionNotice(isWorkspaceHydrated: boolean) {
  const t = useTranslation();
  useEffect(() => {
    if (!isWorkspaceHydrated) return;
    const fileName = consumeWorkspaceRestoreCompletion();
    if (!fileName) return;
    showAppRuntimeNotice(t('settings.backups.restore.success.description', { fileName }), 'success');
  }, [isWorkspaceHydrated, t]);
}
