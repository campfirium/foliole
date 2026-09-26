import path from 'node:path';

export function resolvePackagedMacosAppDataRoot(
  appDataRoot: string,
  platform: NodeJS.Platform,
  isPackaged: boolean | undefined
) {
  if (platform !== 'darwin' || !isPackaged) return appDataRoot;
  const containerSuffix = path.join(
    'Containers', 'com.campfirium.foliole', 'Data', 'Library', 'Application Support'
  );
  if (appDataRoot.endsWith(containerSuffix)) return appDataRoot;
  return path.join(path.dirname(appDataRoot), containerSuffix);
}
