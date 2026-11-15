import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppSpinner } from '../shared/ui';

export function CompanionWorkspaceSyncLoading({ fullScreen = false }: { fullScreen?: boolean }) {
  const t = useTranslation();
  return (
    <div
      aria-busy="true"
      aria-label={t('companion.sync.loading.title')}
      className={`flex items-center justify-center ${fullScreen ? 'h-full' : 'min-h-0 flex-1'}`}
      role="status"
    >
      <AppSpinner className="motion-reduce:animate-none" decorative size="sm" />
    </div>
  );
}
