import { useTranslation } from '../shared/localization/LocalizationProvider';
import type {
  SyncConvergenceCheck,
  SyncConvergenceReport
} from '../shared/platform/companion/sync/diagnostics/companionSyncConvergence';

function statusLabel(status: SyncConvergenceReport['status'], t: ReturnType<typeof useTranslation>) {
  if (status === 'converged') return t('companion.sync.check.upToDate');
  if (status === 'pending') return t('companion.sync.check.stillSyncing');
  if (status === 'system_fault') return t('companion.sync.check.systemIssue');
  return t('companion.sync.check.unknown');
}

function severityClass(severity: SyncConvergenceCheck['severity']) {
  if (severity === 'error') return 'text-error';
  if (severity === 'warning') return 'text-foreground';
  if (severity === 'ok') return 'text-companion-accent';
  return 'text-companion-text-secondary';
}

export function CompanionSyncConvergenceReport(props: { report: SyncConvergenceReport }) {
  const t = useTranslation();
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{t('companion.sync.check.title')}</h3>
        <span className="text-xs font-medium text-companion-text-secondary">{statusLabel(props.report.status, t)}</span>
      </div>
      <div className="mt-2 border-t border-companion-divider">
        {props.report.checks.map((check) => (
          <div className="border-b border-companion-divider py-3 last:border-b-0" key={check.code}>
            <div className={`text-sm font-medium ${severityClass(check.severity)}`}>{check.title}</div>
            <div className="mt-1 text-xs leading-5 text-companion-text-secondary">{check.detail}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
