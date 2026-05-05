import { Loader2 } from 'lucide-react';
import { forwardRef } from 'react';

import { useDesktopCompanionPairingRequests } from '../../shared/platform/useDesktopCompanionPairingRequests';
import { AppButton, AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../shared/ui';

export function CompanionPairingRequestsDialog() {
  const state = useDesktopCompanionPairingRequests(2_000);
  const visibleRequests = state.overview.pending_requests;

  if (!state.isDesktopRuntime || visibleRequests.length === 0) {
    return null;
  }

  return (
    <AppDialog open>
      <AppDialogPortal>
        <AppDialogOverlay />
        <PairingDialogContent state={state} visibleRequests={visibleRequests} />
      </AppDialogPortal>
    </AppDialog>
  );
}

const PairingDialogContent = forwardRef<HTMLDivElement, {
  state: ReturnType<typeof useDesktopCompanionPairingRequests>;
  visibleRequests: ReturnType<typeof useDesktopCompanionPairingRequests>['overview']['pending_requests'];
}>(function PairingDialogContent(
  {
    state,
    visibleRequests
  },
  ref
) {
  const [request] = visibleRequests;
  if (!request) {
    return null;
  }

  return (
    <AppDialogContent
      aria-describedby={undefined}
      className="left-1/2 top-1/2 w-[min(460px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-border/35 bg-bg-panel p-0"
      onEscapeKeyDown={(event) => event.preventDefault()}
      onPointerDownOutside={(event) => event.preventDefault()}
      ref={ref}
    >
      <div className="space-y-5 p-6">
        <PairingDialogHeader />
        <PairingDeviceDetails request={request} />
        <PairingDialogActions request={request} state={state} />
      </div>
    </AppDialogContent>
  );
});

function PairingDialogHeader() {
  return (
    <div className="space-y-2 text-center">
      <AppDialogTitle className="text-base font-semibold text-foreground">
        Pair with Foliole client?
      </AppDialogTitle>
      <p className="text-sm text-foreground/65">
        A device wants to sync with this desktop.
      </p>
    </div>
  );
}

function formatDeviceKind(deviceKind: string) {
  if (deviceKind === 'android-capacitor' || deviceKind === 'android') {
    return 'Android';
  }
  return deviceKind || 'Client';
}


function resolveDeviceName(deviceName: string, deviceKind: string, clientAddress?: string | null) {
  const normalizedName = deviceName.trim();
  const isGeneratedAndroidName = normalizedName.toLowerCase().startsWith('android companion');
  if (!normalizedName || isGeneratedAndroidName) {
    if ((deviceKind === 'android-capacitor' || deviceKind === 'android') && clientAddress === '127.0.0.1') {
      return 'Android Emulator';
    }
    return deviceKind === 'android-capacitor' || deviceKind === 'android' ? 'Android device' : null;
  }
  return normalizedName;
}

function PairingDeviceDetails({
  request
}: {
  request: ReturnType<typeof useDesktopCompanionPairingRequests>['overview']['pending_requests'][number];
}) {
  const deviceName = resolveDeviceName(request.device_name, request.device_kind, request.client_address) ?? 'Device';
  const deviceKind = formatDeviceKind(request.device_kind);
  return (
    <div className="rounded-xl border border-border bg-bg-subtle px-4 py-4 text-center">
      <p className="truncate text-sm font-semibold text-foreground">
        {deviceName} <span className="font-medium text-foreground/60">({deviceKind})</span>
      </p>
      {request.client_address ? (
        <p className="mt-1 truncate text-xs text-foreground/55">{request.client_address}</p>
      ) : null}
    </div>
  );
}

function PairingDialogActions({
  request,
  state
}: {
  request: ReturnType<typeof useDesktopCompanionPairingRequests>['overview']['pending_requests'][number];
  state: ReturnType<typeof useDesktopCompanionPairingRequests>;
}) {
  const disabled = state.pendingActionId === request.pair_request_id;
  const actionIcon = disabled ? <Loader2 aria-hidden="true" className="size-4 animate-spin" strokeWidth={1.8} /> : null;
  return (
    <div className="grid grid-cols-2 gap-3">
      <AppButton
        className="border border-border-strong bg-bg-panel text-foreground hover:bg-bg-subtle"
        disabled={disabled}
        onClick={() => void state.rejectRequest(request.pair_request_id)}
        variant="primary"
      >
        {actionIcon}
        {disabled ? 'Working...' : 'Reject'}
      </AppButton>
      <AppButton
        className="border border-border-strong"
        disabled={disabled}
        onClick={() => void state.approveRequest(request.pair_request_id)}
        variant="primary"
      >
        {actionIcon}
        {disabled ? 'Working...' : 'Allow'}
      </AppButton>
    </div>
  );
}
