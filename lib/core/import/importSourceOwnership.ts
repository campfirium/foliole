export interface ImportSourceOwnership {
  claimState: 'unassigned' | 'proposed' | 'claimed' | 'conflict';
  editable: boolean;
  ownerDeviceName: string | null;
  ownerInstallationId: string | null;
  ownerPlatform: string | null;
}

export function normalizeImportSourceOwnership(value: unknown): ImportSourceOwnership | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const claimState = raw.claimState;
  if (claimState !== 'unassigned' && claimState !== 'proposed' &&
      claimState !== 'claimed' && claimState !== 'conflict') return null;
  return {
    claimState,
    editable: raw.editable === true,
    ownerDeviceName: typeof raw.ownerDeviceName === 'string' ? raw.ownerDeviceName : null,
    ownerInstallationId: typeof raw.ownerInstallationId === 'string' ? raw.ownerInstallationId : null,
    ownerPlatform: typeof raw.ownerPlatform === 'string' ? raw.ownerPlatform : null
  };
}
