import { useEffect } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { requestAppConfirmation } from '../../shared/ui/appConfirmation';
import { consumeWorkspaceRestoreCompletion } from '../../store/workspaceRestoreSession';

export function useWorkspaceRestoreCompletionNotice(isWorkspaceHydrated: boolean) {
  const t = useTranslation();
  useEffect(() => {
    if (!isWorkspaceHydrated) return;
    const fileName = consumeWorkspaceRestoreCompletion();
    if (!fileName) return;
    void requestAppConfirmation({
      cancelLabel: null,
      confirmLabel: t('settings.backups.restore.success.done'),
      description: t('settings.backups.restore.success.description', { fileName }),
      title: t('settings.backups.restore.success.title')
    });
  }, [isWorkspaceHydrated, t]);
}
