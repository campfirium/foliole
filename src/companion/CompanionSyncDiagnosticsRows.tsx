import type {
  SyncDiagnosticCountRange,
  SyncDiagnosticDirtyObject,
  SyncDiagnosticPendingAck
} from '../../lib/platform/syncDiagnosticsContract';

function formatSeq(value: number | null | undefined) {
  return typeof value === 'number' ? `${value}` : '-';
}

function formatHash(value: string | null | undefined) {
  return value ? value.slice(0, 10) : '-';
}

export function ObjectTypeRows(props: { rows: SyncDiagnosticCountRange[] }) {
  if (props.rows.length === 0) {
    return <p className="py-3 text-sm text-companion-text-secondary">No sync objects yet.</p>;
  }
  return (
    <div className="border-t border-companion-divider">
      {props.rows.map((row) => (
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 border-b border-companion-divider py-3 text-sm last:border-b-0" key={row.object_type}>
          <span className="min-w-0 truncate font-medium text-foreground">{row.object_type}</span>
          <span className="text-companion-text-secondary">{row.count}</span>
          <span className={row.dirty_count ? 'text-foreground' : 'text-companion-text-secondary'}>
            {row.dirty_count ?? 0} waiting
          </span>
        </div>
      ))}
    </div>
  );
}

export function DirtyObjectRows(props: { rows: SyncDiagnosticDirtyObject[] }) {
  if (props.rows.length === 0) {
    return <p className="py-3 text-sm text-companion-text-secondary">No device changes waiting to send.</p>;
  }
  return (
    <div className="border-t border-companion-divider">
      {props.rows.map((row) => (
        <div className="border-b border-companion-divider py-3 text-xs leading-5 last:border-b-0" key={`${row.object_type}:${row.object_id}`}>
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate font-medium text-foreground">{row.object_type}</span>
            <span className="shrink-0 tabular-nums text-companion-text-secondary">seq {formatSeq(row.state_seq)}</span>
          </div>
          <div className="mt-1 min-w-0 truncate text-companion-text-secondary">{row.object_id}</div>
          <div className="mt-1 text-companion-text-secondary">hash {formatHash(row.content_hash)}</div>
        </div>
      ))}
    </div>
  );
}

export function PendingAckRows(props: { emptyText?: string; rows: SyncDiagnosticPendingAck[] }) {
  if (props.rows.length === 0) {
    return <p className="py-3 text-sm text-companion-text-secondary">{props.emptyText ?? 'No desktop confirmations waiting.'}</p>;
  }
  return (
    <div className="border-t border-companion-divider">
      {props.rows.map((row) => (
        <div className="border-b border-companion-divider py-3 text-xs leading-5 last:border-b-0" key={row.client_op_id}>
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate font-medium text-foreground">{row.object_type}</span>
            <span className="shrink-0 tabular-nums text-companion-text-secondary">seq {formatSeq(row.state_seq)}</span>
          </div>
          <div className="mt-1 min-w-0 truncate text-companion-text-secondary">{row.object_id}</div>
          <div className="mt-1 text-companion-text-secondary">{row.status}</div>
        </div>
      ))}
    </div>
  );
}
