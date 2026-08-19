import type { ExternalSourceSettingsFolder } from '../../../../shared/platform/externalSourceSettingsRepository';

export interface RemoteExternalFolderGroup {
  deviceName: string;
  folders: ExternalSourceSettingsFolder[];
  key: string;
  platformName: string | null;
}

const PLATFORM_NAMES: Record<string, string> = {
  darwin: 'macOS',
  linux: 'Linux',
  win32: 'Windows'
};

export function groupRemoteExternalFolders(
  folders: ExternalSourceSettingsFolder[],
  unknownDeviceName: string,
  unownedDeviceName: string
) {
  const groups = new Map<string, RemoteExternalFolderGroup>();
  folders.forEach((folder) => {
    const isUnowned = folder.accessMode === 'unowned';
    const key = isUnowned ? 'unowned' : folder.ownerInstallationId ? `device:${folder.ownerInstallationId}` : `folder:${folder.id}`;
    const group = groups.get(key) ?? {
      deviceName: isUnowned ? unownedDeviceName : folder.ownerDeviceName?.trim() || unknownDeviceName,
      folders: [],
      key,
      platformName: isUnowned || !folder.ownerPlatform
        ? null
        : PLATFORM_NAMES[folder.ownerPlatform] ?? null
    };
    group.folders.push(folder);
    groups.set(key, group);
  });
  return [...groups.values()];
}
