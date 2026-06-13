import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { app } from 'electron';

export function resolveGlobalCapturePreloadPath(fileName: string) {
  const appPath = app.getAppPath();
  const packagedPath = join(appPath, 'electron', fileName);
  const candidates = [
    packagedPath,
    join(appPath, '..', '..', 'electron', fileName)
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? packagedPath;
}
