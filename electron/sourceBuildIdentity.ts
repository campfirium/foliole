import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SOURCE_USER_DATA_NAME = 'foliole-source';
export const SOURCE_LIBRARY_NAME = 'Foliole Source';

interface SourceAppIdentity {
  getAppPath?(): string;
  getPath(name: 'appData'): string;
  isPackaged?: boolean;
}

export function prepareSourceBuildIdentity(app: SourceAppIdentity, platform: NodeJS.Platform, env: NodeJS.ProcessEnv) {
  const sourceBuild = platform === 'darwin' && isPackagedSourceBuild(app.getAppPath?.() ?? '', app.isPackaged);
  if (!sourceBuild) return null;
  env.FOLIOLE_BUILD_CHANNEL = 'source';
  const userData = path.join(app.getPath('appData'), SOURCE_USER_DATA_NAME);
  const libraryHome = path.join(os.homedir(), 'Documents', SOURCE_LIBRARY_NAME);
  env.FOLIOLE_USER_DATA_PATH = userData;
  env.FOLIOLE_SESSION_DATA_PATH = userData;
  env.FOLIOLE_LIBRARY_HOME = libraryHome;
  return libraryHome;
}

export function isPackagedSourceBuild(appPath: string, isPackaged: boolean | undefined) {
  if (!isPackaged) return false;
  try {
    const metadata = JSON.parse(readFileSync(path.join(appPath, 'package.json'), 'utf8')) as Record<string, unknown>;
    return metadata.folioleBuildChannel === 'source';
  } catch {
    return false;
  }
}
