import type {
  SyncDiagnosticCountRange,
  SyncDiagnosticDirtyObject,
  SyncDiagnosticPendingAck
} from '../../lib/platform/syncDiagnosticsContract';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppEmptyState } from '../shared/ui';

type Translate = ReturnType<typeof useTranslation>;

function formatSeq(value: number | null | undefined) {
  return typeof value === 'number' ? `${value}` : '-';
}

function formatHash(value: string | null | undefined) {
  return value ? value.slice(0, 10) : '-';
}

function formatObjectTypeStatus(row: SyncDiagnosticCountRange, t: Translate) {
  return t('companion.sync.diagnostics.objects.status', {
    confirming: row.pending_ack_count ?? 0,
    notSent: row.push_issue_count ?? 0,
    ready: row.ready_dirty_count ?? row.dirty_count ?? 0
  });
}

export function ObjectTypeRows(props: { rows: SyncDiagnosticCountRange[] }) {
  const t = useTranslation();
  if (props.rows.length === 0) {
    return <AppEmptyState className="min-h-0 items-start py-3 text-left text-companion-text-secondary" description={t('companion.sync.diagnostics.objects.empty.description')} title={t('companion.sync.diagnostics.objects.empty.title')} />;
  }
  return (
    <div className="border-t border-companion-divider">
      {props.rows.map((row) => (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-companion-divider py-3 text-sm last:border-b-0" key={row.object_type}>
          <span className="min-w-0 break-words font-medium text-foreground">{row.object_type}</span>
          <span className="text-companion-text-secondary">{row.count}</span>
          <span className="col-span-2 text-xs text-companion-text-secondary">{formatObjectTypeStatus(row, t)}</span>
        </div>
      ))}
    </div>
  );
}

export function DirtyObjectRows(props: { rows: SyncDiagnosticDirtyObject[] }) {
  const t = useTranslation();
  if (props.rows.length === 0) {
    return <AppEmptyState className="min-h-0 items-start py-3 text-left text-companion-text-secondary" description={t('companion.sync.diagnostics.deviceChanges.empty.description')} title={t('companion.sync.diagnostics.deviceChanges.empty.title')} />;
  }
  return (
    <div className="border-t border-companion-divider">
      {props.rows.map((row) => (
        <div className="border-b border-companion-divider py-3 text-xs leading-5 last:border-b-0" key={`${row.object_type}:${row.object_id}`}>
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 break-words font-medium text-foreground">{row.object_type}</span>
            <span className="shrink-0 tabular-nums text-companion-text-secondary">{t('companion.sync.diagnostics.seq', { value: formatSeq(row.state_seq) })}</span>
          </div>
          <div className="mt-1 min-w-0 break-all text-companion-text-secondary">{row.object_id}</div>
          <div className="mt-1 text-companion-text-secondary">{t('companion.sync.diagnostics.hash', { value: formatHash(row.content_hash) })}</div>
        </div>
      ))}
    </div>
  );
}

export function PendingAckRows(props: { emptyText?: string; rows: SyncDiagnosticPendingAck[] }) {
  const t = useTranslation();
  if (props.rows.length === 0) {
    return (
      <AppEmptyState
        className="min-h-0 items-start py-3 text-left text-companion-text-secondary"
        description={t('companion.sync.diagnostics.pending.empty.description')}
        title={props.emptyText ?? t('companion.sync.diagnostics.pending.empty.title')}
      />
    );
  }
  return (
    <div className="border-t border-companion-divider">
      {props.rows.map((row) => (
        <div className="border-b border-companion-divider py-3 text-xs leading-5 last:border-b-0" key={row.client_op_id}>
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 break-words font-medium text-foreground">{row.object_type}</span>
            <span className="shrink-0 tabular-nums text-companion-text-secondary">{t('companion.sync.diagnostics.seq', { value: formatSeq(row.state_seq) })}</span>
          </div>
          <div className="mt-1 min-w-0 break-all text-companion-text-secondary">{row.object_id}</div>
          <div className="mt-1 text-companion-text-secondary">{row.status}</div>
        </div>
      ))}
    </div>
  );
}
