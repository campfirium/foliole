import type {
  SyncDiagnosticCountRange,
  SyncDiagnosticDirtyObject,
  SyncDiagnosticPendingAck
} from '../../lib/platform/syncDiagnosticsContract';
import { AppEmptyState } from '../shared/ui';

function formatSeq(value: number | null | undefined) {
  return typeof value === 'number' ? `${value}` : '-';
}

function formatHash(value: string | null | undefined) {
  return value ? value.slice(0, 10) : '-';
}

function formatObjectTypeStatus(row: SyncDiagnosticCountRange) {
  return `${row.ready_dirty_count ?? row.dirty_count ?? 0} ready to send · ${row.pending_ack_count ?? 0} confirming · ${row.push_issue_count ?? 0} not sent`;
}

export function ObjectTypeRows(props: { rows: SyncDiagnosticCountRange[] }) {
  if (props.rows.length === 0) {
    return <AppEmptyState className="min-h-0 items-start py-3 text-left text-companion-text-secondary" description="Sync object totals will appear after a diagnostic run finds them." title="No sync objects yet" />;
  }
  return (
    <div className="border-t border-companion-divider">
      {props.rows.map((row) => (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-companion-divider py-3 text-sm last:border-b-0" key={row.object_type}>
          <span className="min-w-0 break-words font-medium text-foreground">{row.object_type}</span>
          <span className="text-companion-text-secondary">{row.count}</span>
          <span className="col-span-2 text-xs text-companion-text-secondary">{formatObjectTypeStatus(row)}</span>
        </div>
      ))}
    </div>
  );
}

export function DirtyObjectRows(props: { rows: SyncDiagnosticDirtyObject[] }) {
  if (props.rows.length === 0) {
    return <AppEmptyState className="min-h-0 items-start py-3 text-left text-companion-text-secondary" description="This device has no local changes queued for desktop." title="No device changes waiting to send" />;
  }
  return (
    <div className="border-t border-companion-divider">
      {props.rows.map((row) => (
        <div className="border-b border-companion-divider py-3 text-xs leading-5 last:border-b-0" key={`${row.object_type}:${row.object_id}`}>
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 break-words font-medium text-foreground">{row.object_type}</span>
            <span className="shrink-0 tabular-nums text-companion-text-secondary">seq {formatSeq(row.state_seq)}</span>
          </div>
          <div className="mt-1 min-w-0 break-all text-companion-text-secondary">{row.object_id}</div>
          <div className="mt-1 text-companion-text-secondary">hash {formatHash(row.content_hash)}</div>
        </div>
      ))}
    </div>
  );
}

export function PendingAckRows(props: { emptyText?: string; rows: SyncDiagnosticPendingAck[] }) {
  if (props.rows.length === 0) {
    return (
      <AppEmptyState
        className="min-h-0 items-start py-3 text-left text-companion-text-secondary"
        description="This diagnostic section has no rows to report."
        title={props.emptyText ?? 'No desktop confirmations waiting.'}
      />
    );
  }
  return (
    <div className="border-t border-companion-divider">
      {props.rows.map((row) => (
        <div className="border-b border-companion-divider py-3 text-xs leading-5 last:border-b-0" key={row.client_op_id}>
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 break-words font-medium text-foreground">{row.object_type}</span>
            <span className="shrink-0 tabular-nums text-companion-text-secondary">seq {formatSeq(row.state_seq)}</span>
          </div>
          <div className="mt-1 min-w-0 break-all text-companion-text-secondary">{row.object_id}</div>
          <div className="mt-1 text-companion-text-secondary">{row.status}</div>
        </div>
      ))}
    </div>
  );
}
