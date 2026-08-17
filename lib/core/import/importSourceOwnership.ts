export interface ImportSourceOwnership {
  editable: boolean;
  ownerDeviceName: string | null;
  ownerInstallationId: string | null;
  ownerPlatform: string | null;
}

export function normalizeImportSourceOwnership(value: unknown): ImportSourceOwnership | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  return {
    editable: raw.editable === true,
    ownerDeviceName: typeof raw.ownerDeviceName === 'string' ? raw.ownerDeviceName : null,
    ownerInstallationId: typeof raw.ownerInstallationId === 'string' ? raw.ownerInstallationId : null,
    ownerPlatform: typeof raw.ownerPlatform === 'string' ? raw.ownerPlatform : null
  };
}
