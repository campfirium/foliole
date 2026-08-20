import type { ExternalSourceSettingsFolder } from '../../../../shared/platform/externalSourceSettingsRepository';

export interface RemoteExternalFolderGroup {
  folders: ExternalSourceSettingsFolder[];
  hostName: string;
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
  unknownHostName: string
) {
  const groups = new Map<string, RemoteExternalFolderGroup>();
  folders.forEach((folder) => {
    const key = folder.sourceHostName?.trim() || `folder:${folder.id}`;
    const group = groups.get(key) ?? {
      folders: [],
      hostName: folder.sourceHostName?.trim() || unknownHostName,
      key,
      platformName: !folder.sourceHostPlatform
        ? null
        : PLATFORM_NAMES[folder.sourceHostPlatform] ?? null
    };
    group.folders.push(folder);
    groups.set(key, group);
  });
  return [...groups.values()];
}
