import type { ExternalSourceSettingsFolder } from '../../../../shared/platform/externalSourceSettingsRepository';

export type RemoteFolderGroupState = boolean | 'mixed';

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
  unknownDeviceName: string
) {
  const groups = new Map<string, RemoteExternalFolderGroup>();
  folders.forEach((folder) => {
    const key = folder.ownerInstallationId ? `device:${folder.ownerInstallationId}` : `folder:${folder.id}`;
    const group = groups.get(key) ?? {
      deviceName: folder.ownerDeviceName?.trim() || unknownDeviceName,
      folders: [],
      key,
      platformName: folder.ownerPlatform ? PLATFORM_NAMES[folder.ownerPlatform] ?? null : null
    };
    group.folders.push(folder);
    groups.set(key, group);
  });
  return [...groups.values()];
}

export function remoteFolderGroupState(folders: ExternalSourceSettingsFolder[]): RemoteFolderGroupState {
  const enabledCount = folders.filter((folder) => folder.mirrorEnabled !== false).length;
  if (enabledCount === 0) return false;
  if (enabledCount === folders.length) return true;
  return 'mixed';
}

export function remoteFolderName(folderPath: string) {
  return folderPath.split(/[\\/]/).filter(Boolean).at(-1) ?? folderPath;
}
