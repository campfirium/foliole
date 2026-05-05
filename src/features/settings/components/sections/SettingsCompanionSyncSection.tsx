import { formatCompanionPairingRequestTime } from '../../../../shared/lib/companionPairingPresentation';
import { useDesktopCompanionPairingRequests } from '../../../../shared/platform/useDesktopCompanionPairingRequests';
import { AppButton, AppStatusBadge, SettingsControlSlot, SettingsRow, SettingsSection } from '../../../../shared/ui';

function formatServerTone(state: 'failed' | 'running' | 'stopped') {
  if (state === 'running') {
    return 'success';
  }
  if (state === 'failed') {
    return 'error';
  }
  return 'neutral';
}

function formatServerLabel(state: 'failed' | 'running' | 'stopped') {
  if (state === 'running') {
    return 'On';
  }
  if (state === 'failed') {
    return 'Problem';
  }
  return 'Off';
}

function renderDesktopAvailabilityDescription(overview: ReturnType<typeof useDesktopCompanionPairingRequests>['overview']) {
  if (!overview.sync_enabled) {
    return 'Device sync is off. Turn it on only when you want another device to connect to this desktop.';
  }
  if (overview.server_status.state === 'running') {
    if (overview.server_status.paired_device_count > 0) {
      return 'Device sync is on. Paired devices can reconnect quietly while this desktop is running.';
    }
    return 'Device sync is on. Another device can ask to connect while both devices are on the same Wi-Fi.';
  }
  if (overview.server_status.last_error) {
    return `Device sync is on, but this desktop could not open local connection right now. ${overview.server_status.last_error}`;
  }
  return 'Device sync is turning on for this desktop.';
}

function CompanionSyncSectionActions(props: {
  overview: ReturnType<typeof useDesktopCompanionPairingRequests>['overview'];
  state: ReturnType<typeof useDesktopCompanionPairingRequests>;
}) {
  return (
    <div className="flex items-center gap-2">
      <AppButton
        disabled={!props.state.isDesktopRuntime || props.state.pendingActionId !== null}
        onClick={() => void (props.overview.sync_enabled ? props.state.disableSync() : props.state.enableSync())}
      >
        {props.overview.sync_enabled ? 'Turn off device sync' : 'Turn on device sync'}
      </AppButton>
      <AppButton
        disabled={
          !props.state.isDesktopRuntime ||
          props.overview.server_status.paired_device_count === 0 ||
          props.state.pendingActionId !== null
        }
        onClick={() => void props.state.clearPairedDevices()}
        variant="ghost"
      >
        Forget connected devices
      </AppButton>
      <AppButton disabled={!props.state.isDesktopRuntime} onClick={() => void props.state.refresh()} variant="ghost">
        Refresh
      </AppButton>
    </div>
  );
}

export function SettingsCompanionSyncSection() {
  const state = useDesktopCompanionPairingRequests(3_000);
  const overview = state.overview;

  return (
    <SettingsSection
      actions={<CompanionSyncSectionActions overview={overview} state={state} />}
      ariaLabel="Companion sync section"
      description="Let another device bring content from this desktop. Once enabled, paired devices can reconnect quietly while this desktop is running."
      title="Device sync"
    >
      <SettingsRow
        description={renderDesktopAvailabilityDescription(overview)}
        title="This desktop"
      >
        <SettingsControlSlot className="justify-end">
          <AppStatusBadge
            label={formatServerLabel(overview.server_status.state)}
            tone={formatServerTone(overview.server_status.state)}
          />
        </SettingsControlSlot>
      </SettingsRow>
      <SettingsRow
        description={`${overview.server_status.paired_device_count} device(s) remembered, ${overview.pending_requests.length} request(s) waiting`}
        title="Connected devices"
      >
        <SettingsControlSlot className="justify-end text-sm text-foreground/65">
          {state.isLoading ? 'Loading...' : overview.sync_enabled ? 'Enabled' : 'Disabled'}
        </SettingsControlSlot>
      </SettingsRow>
      {overview.pending_requests.length === 0 ? (
        <EmptyPendingRequestsRow error={state.error} />
      ) : (
        overview.pending_requests.map((request) => (
          <PendingPairingRequestRow key={request.pair_request_id} request={request} state={state} />
        ))
      )}

      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
    </SettingsSection>
  );
}

function EmptyPendingRequestsRow({ error }: { error: string | null }) {
  return (
    <SettingsRow
      description={
        error ?? 'No device is waiting right now. New requests will appear here when another device asks to connect.'
      }
      readonly
      title="Waiting devices"
    />
  );
}

function PendingPairingRequestRow({
  request,
  state
}: {
  request: ReturnType<typeof useDesktopCompanionPairingRequests>['overview']['pending_requests'][number];
  state: ReturnType<typeof useDesktopCompanionPairingRequests>;
}) {
  return (
    <SettingsRow
      description={`Asked to connect ${formatCompanionPairingRequestTime(request.requested_at)}`}
      title={request.device_name}
    >
      <SettingsControlSlot className="justify-end">
        <AppButton
          disabled={state.pendingActionId === request.pair_request_id}
          onClick={() => void state.rejectRequest(request.pair_request_id)}
          variant="ghost"
        >
          Reject
        </AppButton>
        <AppButton
          disabled={state.pendingActionId === request.pair_request_id}
          onClick={() => void state.approveRequest(request.pair_request_id)}
        >
          Allow
        </AppButton>
      </SettingsControlSlot>
    </SettingsRow>
  );
}
