export function isCompanionAutoSyncEligible(args: {
  hasCompletedSync: boolean;
  pairingUsable: boolean;
  participating: boolean;
  providerAvailable: boolean;
}) {
  return args.hasCompletedSync && args.pairingUsable
    && args.participating && args.providerAvailable;
}
