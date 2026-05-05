import { useDesktopCompanionPairingRequests } from '../../../../shared/platform/useDesktopCompanionPairingRequests';
import { SettingsControlSlot, SettingsRow, SettingsSection } from '../../../../shared/ui';

function renderSyncError(overview: ReturnType<typeof useDesktopCompanionPairingRequests>['overview']) {
  if (overview.server_status.last_error) {
    return `Could not open sync. ${overview.server_status.last_error}`;
  }
  return undefined;
}

function DeviceSyncSwitch(props: {
  state: ReturnType<typeof useDesktopCompanionPairingRequests>;
}) {
  const overview = props.state.overview;
  const disabled = !props.state.isDesktopRuntime || props.state.pendingActionId !== null || props.state.isLoading;

  return (
    <button
      aria-checked={overview.sync_enabled}
      aria-label="Sync"
      className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors ${
        overview.sync_enabled ? 'border-border-strong bg-foreground/[0.14]' : 'border-border bg-bg-elevated'
      } disabled:opacity-50`}
      disabled={disabled}
      onClick={() => void (overview.sync_enabled ? props.state.disableSync() : props.state.enableSync())}
      role="switch"
      type="button"
    >
      <span
        aria-hidden="true"
        className={`absolute h-6 w-6 rounded-full bg-bg-panel shadow-sm transition-transform ${
          overview.sync_enabled ? 'translate-x-7' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export function SettingsCompanionSyncSection() {
  const state = useDesktopCompanionPairingRequests(3_000);
  const overview = state.overview;

  return (
    <SettingsSection
      ariaLabel="Sync section"
      title="Sync"
    >
      <SettingsRow
        description={renderSyncError(overview)}
        title="Sync"
      >
        <SettingsControlSlot className="justify-end">
          <DeviceSyncSwitch state={state} />
        </SettingsControlSlot>
      </SettingsRow>
      <SettingsRow
        title="Connected devices"
      >
        <SettingsControlSlot className="justify-end text-sm text-foreground/65">
          {state.isLoading ? 'Loading...' : overview.server_status.paired_device_count}
        </SettingsControlSlot>
      </SettingsRow>
      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
    </SettingsSection>
  );
}
