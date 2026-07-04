import fs from 'node:fs';
import path from 'node:path';

import {
  normalizeLibraryPath,
  resolveDefaultInboxPath,
  resolveLegacyDefaultInboxPath
} from '../../lib/platform/libraryPaths.js';
import type { NativeLibraryPaths } from '../../lib/platform/nativeUtilityContract.js';

function areSameNormalizedPath(left: string, right: string) {
  return normalizeLibraryPath(left)?.toLowerCase() === normalizeLibraryPath(right)?.toLowerCase();
}

function resolveAvailableChildPath(targetPath: string) {
  if (!fs.existsSync(targetPath)) {
    return targetPath;
  }
  let suffix = 2;
  while (fs.existsSync(`${targetPath} ${suffix}`)) {
    suffix += 1;
  }
  return `${targetPath} ${suffix}`;
}

export function migrateLegacyDefaultInbox(paths: NativeLibraryPaths) {
  const defaultInboxPath = resolveDefaultInboxPath(paths.library_home);
  if (!areSameNormalizedPath(paths.inbox, defaultInboxPath)) {
    return;
  }
  const legacyInboxPath = resolveLegacyDefaultInboxPath(paths.library_home);
  if (areSameNormalizedPath(legacyInboxPath, paths.inbox) || !fs.existsSync(legacyInboxPath)) {
    return;
  }
  fs.mkdirSync(paths.inbox, { recursive: true });
  for (const entry of fs.readdirSync(legacyInboxPath, { withFileTypes: true })) {
    fs.renameSync(
      path.join(legacyInboxPath, entry.name),
      resolveAvailableChildPath(path.join(paths.inbox, entry.name))
    );
  }
  fs.rmdirSync(legacyInboxPath);
}
