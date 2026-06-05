import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppEmptyState, AppErrorState } from '../shared/ui';

export function CompanionSyncDiagnosticStatus(props: {
  error: string | null;
  status: 'checking' | 'idle' | 'running';
}) {
  const t = useTranslation();
  if (props.error) {
    return (
      <AppErrorState
        className="min-h-0 items-start text-left text-error"
        description={props.error}
        title={t('companion.sync.diagnostic.failed')}
      />
    );
  }
  if (props.status === 'running') {
    return (
      <AppEmptyState
        className="min-h-0 items-start text-left text-companion-text-secondary"
        description={t('companion.sync.diagnostic.running.description')}
        title={t('companion.sync.diagnostic.running.title')}
      />
    );
  }
  if (props.status === 'checking') {
    return (
      <AppEmptyState
        className="min-h-0 items-start text-left text-companion-text-secondary"
        description={t('companion.sync.diagnostic.checking.description')}
        title={t('companion.sync.diagnostic.checking.title')}
      />
    );
  }
  return null;
}
