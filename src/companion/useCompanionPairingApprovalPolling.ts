import { useEffect, useRef } from 'react';

type PairingPollingState = {
  completePairing(): Promise<{ sync_usable?: boolean } | null | undefined>;
  pairingStatus: string;
  pendingPairRequest: { endpointUrl: string } | null;
  pullFromDesktop(endpointUrl: string): Promise<unknown>;
};

export function useCompanionPairingApprovalPolling(
  workspaceSync: PairingPollingState,
  pollIntervalMs: number
) {
  const completePairingRef = useRef(workspaceSync.completePairing);
  const pullFromDesktopRef = useRef(workspaceSync.pullFromDesktop);
  completePairingRef.current = workspaceSync.completePairing;
  pullFromDesktopRef.current = workspaceSync.pullFromDesktop;

  useEffect(() => {
    if (!workspaceSync.pendingPairRequest || workspaceSync.pairingStatus !== 'awaiting-approval') return;
    const pairingEndpoint = workspaceSync.pendingPairRequest.endpointUrl;
    const completeApprovedPairing = () => {
      void completePairingRef.current()
        .then((pairingState) => pairingState?.sync_usable
          ? pullFromDesktopRef.current(pairingEndpoint)
          : null)
        .catch(() => undefined);
    };
    completeApprovedPairing();
    const timer = window.setInterval(completeApprovedPairing, pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [pollIntervalMs, workspaceSync.pairingStatus, workspaceSync.pendingPairRequest]);
}
