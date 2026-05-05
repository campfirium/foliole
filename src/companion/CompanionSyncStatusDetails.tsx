import type { NativeCompanionPairingState, NativeCompanionSyncEvent } from '../../lib/platform/nativeCompanionSyncContract';

function formatSyncTimestamp(timestamp: string | null) {
  if (!timestamp) {
    return 'Never synced';
  }
  return new Date(timestamp).toLocaleString();
}

function formatDeviceKind(deviceKind: string | null) {
  if (deviceKind === 'android-capacitor' || deviceKind === 'android') {
    return 'Android';
  }
  return deviceKind ?? 'Device';
}

function formatPairedDevice(pairingState: NativeCompanionPairingState) {
  const name = pairingState.device_name?.trim() || 'This device';
  return `${name} (${formatDeviceKind(pairingState.device_kind)})`;
}

function SyncInfoRow(props: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-companion-divider py-3 last:border-b-0">
      <span className="text-sm text-companion-text-secondary">{props.label}</span>
      <span className="max-w-64 text-right text-sm font-medium text-foreground">{props.value}</span>
    </div>
  );
}

function formatEventStatus(status: NativeCompanionSyncEvent['status']) {
  if (status === 'completed') {
    return 'Done';
  }
  if (status === 'failed') {
    return 'Failed';
  }
  if (status === 'skipped') {
    return 'Checked';
  }
  return 'Started';
}

function SyncActivityList(props: { events: NativeCompanionSyncEvent[] }) {
  return (
    <div className="mt-5 border-t border-companion-divider pt-4">
      <h4 className="text-sm font-medium text-foreground">Sync log</h4>
      <div className="mt-3 space-y-3">
        {props.events.length === 0 ? (
          <p className="text-sm leading-6 text-companion-text-secondary">No sync records yet.</p>
        ) : props.events.slice(0, 8).map((event) => (
          <div className="text-sm leading-5" key={event.id}>
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-foreground">{formatEventStatus(event.status)}</span>
              <span className="text-xs text-companion-text-secondary">{formatSyncTimestamp(event.occurred_at)}</span>
            </div>
            <p className="mt-1 text-companion-text-secondary">{event.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CompanionSyncStatusDetails(props: {
  endpointUrl: string;
  lastSyncedAt: string | null;
  pairingState: NativeCompanionPairingState;
  syncEvents: NativeCompanionSyncEvent[];
  status: 'idle' | 'loading' | 'syncing';
}) {
  const isSyncing = props.status === 'syncing';
  return (
    <>
      <div>
        <SyncInfoRow label="Status" value={isSyncing ? 'Syncing' : 'Paired'} />
        <SyncInfoRow label="Last sync" value={formatSyncTimestamp(props.lastSyncedAt)} />
        <SyncInfoRow label="Device" value={formatPairedDevice(props.pairingState)} />
        <SyncInfoRow label="Desktop" value={props.endpointUrl} />
      </div>
      <SyncActivityList events={props.syncEvents} />
    </>
  );
}
