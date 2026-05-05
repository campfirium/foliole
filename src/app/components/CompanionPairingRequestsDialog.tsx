import {
  forwardRef,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction
} from 'react';

import { formatCompanionPairingRequestTime } from '../../shared/lib/companionPairingPresentation';
import { useDesktopCompanionPairingRequests } from '../../shared/platform/useDesktopCompanionPairingRequests';
import { AppButton, AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../shared/ui';

export function CompanionPairingRequestsDialog({
  onOpenCompanionSyncSettings
}: {
  onOpenCompanionSyncSettings: () => void;
}) {
  const state = useDesktopCompanionPairingRequests(2_000);
  const [snoozedIds, setSnoozedIds] = useState<string[]>([]);
  const visibleRequests = useVisiblePairingRequests(state, snoozedIds, setSnoozedIds);

  if (!state.isDesktopRuntime || visibleRequests.length === 0) {
    return null;
  }

  return (
    <AppDialog onOpenChange={(open) => !open && snoozeVisibleRequests(visibleRequests, setSnoozedIds)} open>
      <AppDialogPortal>
        <AppDialogOverlay />
        <PairingDialogContent
          onOpenCompanionSyncSettings={onOpenCompanionSyncSettings}
          setSnoozedIds={setSnoozedIds}
          state={state}
          visibleRequests={visibleRequests}
        />
      </AppDialogPortal>
    </AppDialog>
  );
}

function useVisiblePairingRequests(
  state: ReturnType<typeof useDesktopCompanionPairingRequests>,
  snoozedIds: string[],
  setSnoozedIds: Dispatch<SetStateAction<string[]>>
) {
  useEffect(() => {
    setSnoozedIds((current) =>
      current.filter((pairRequestId) =>
        state.overview.pending_requests.some((request) => request.pair_request_id === pairRequestId)
      )
    );
  }, [setSnoozedIds, state.overview.pending_requests]);

  return useMemo(
    () => state.overview.pending_requests.filter((request) => !snoozedIds.includes(request.pair_request_id)),
    [snoozedIds, state.overview.pending_requests]
  );
}

const PairingDialogContent = forwardRef<HTMLDivElement, {
  onOpenCompanionSyncSettings: () => void;
  setSnoozedIds: Dispatch<SetStateAction<string[]>>;
  state: ReturnType<typeof useDesktopCompanionPairingRequests>;
  visibleRequests: ReturnType<typeof useDesktopCompanionPairingRequests>['overview']['pending_requests'];
}>(function PairingDialogContent(
  {
    onOpenCompanionSyncSettings,
    setSnoozedIds,
    state,
    visibleRequests
  },
  ref
) {
  return (
    <AppDialogContent
      aria-describedby={undefined}
      className="left-1/2 top-1/2 w-[min(560px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-border/35 bg-bg-panel p-0"
      ref={ref}
    >
      <div className="space-y-5 p-6">
        <PairingDialogHeader />
        <div className="space-y-3">
          {visibleRequests.map((request) => (
            <PairingRequestCard key={request.pair_request_id} request={request} state={state} />
          ))}
        </div>
        <PairingDialogActions
          onOpenCompanionSyncSettings={onOpenCompanionSyncSettings}
          setSnoozedIds={setSnoozedIds}
          visibleRequests={visibleRequests}
        />
      </div>
    </AppDialogContent>
  );
});

function PairingDialogHeader() {
  return (
    <div className="space-y-2">
      <AppDialogTitle className="text-base font-semibold text-foreground">
        Android companion wants to pair
      </AppDialogTitle>
      <p className="text-sm text-foreground/65">
        Approve a device once, then later sync can stay quiet and reuse the saved pairing.
      </p>
    </div>
  );
}

function PairingDialogActions({
  onOpenCompanionSyncSettings,
  setSnoozedIds,
  visibleRequests
}: {
  onOpenCompanionSyncSettings: () => void;
  setSnoozedIds: Dispatch<SetStateAction<string[]>>;
  visibleRequests: ReturnType<typeof useDesktopCompanionPairingRequests>['overview']['pending_requests'];
}) {
  return (
    <div className="flex justify-end">
      <AppButton
        onClick={() => {
          snoozeVisibleRequests(visibleRequests, setSnoozedIds);
          onOpenCompanionSyncSettings();
        }}
        variant="ghost"
      >
        Open settings
      </AppButton>
      <AppButton onClick={() => snoozeVisibleRequests(visibleRequests, setSnoozedIds)} variant="ghost">
        Review later
      </AppButton>
    </div>
  );
}

function PairingRequestCard({
  request,
  state
}: {
  request: ReturnType<typeof useDesktopCompanionPairingRequests>['overview']['pending_requests'][number];
  state: ReturnType<typeof useDesktopCompanionPairingRequests>;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-settings-outline bg-settings-group px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{request.device_name}</p>
        <p className="mt-1 text-sm text-foreground/65">
          {request.device_kind}, requested {formatCompanionPairingRequestTime(request.requested_at)}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
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
      </div>
    </div>
  );
}

function snoozeVisibleRequests(
  requests: ReturnType<typeof useDesktopCompanionPairingRequests>['overview']['pending_requests'],
  setSnoozedIds: Dispatch<SetStateAction<string[]>>
) {
  setSnoozedIds((current) => [...new Set([...current, ...requests.map((request) => request.pair_request_id)])]);
}
