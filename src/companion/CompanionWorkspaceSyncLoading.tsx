import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppLoadingState } from '../shared/ui';

export function CompanionWorkspaceSyncLoading() {
  const t = useTranslation();
  return (
    <AppLoadingState
      className="min-h-0 items-start border-t border-companion-divider px-1 py-6 text-left text-companion-text-secondary"
      description={t('companion.sync.loading.description')}
      label={t('companion.sync.loading.title')}
      title={t('companion.sync.loading.title')}
    />
  );
}
