export interface ReadwiseActiveSelection {
  deviceName: string;
  installationId: string;
  platform: string;
}

export interface ReadwiseDeviceRuntimeState {
  readwiseActiveDeviceName: string | null;
  readwiseActiveInstallationId: string | null;
  readwiseCurrentDeviceName: string | null;
  readwiseCurrentInstallationId: string | null;
  readwiseSettingsConfirmed: boolean;
}

export function normalizeReadwiseActiveSelection(value: unknown): ReadwiseActiveSelection | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const installationId = typeof raw.installationId === 'string' ? raw.installationId.trim() : '';
  if (!installationId) return null;
  return {
    deviceName: typeof raw.deviceName === 'string' ? raw.deviceName.trim() : '',
    installationId,
    platform: typeof raw.platform === 'string' ? raw.platform.trim() : ''
  };
}

export function createDefaultReadwiseDeviceRuntimeState(): ReadwiseDeviceRuntimeState {
  return {
    readwiseActiveDeviceName: null,
    readwiseActiveInstallationId: null,
    readwiseCurrentDeviceName: null,
    readwiseCurrentInstallationId: null,
    readwiseSettingsConfirmed: false
  };
}
