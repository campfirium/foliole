/* global process */

import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

export function canonicalWorktreePath(path) {
  return realpathSync.native(resolve(path));
}

export function pathsReferToSameLocation(
  left,
  right,
  { platform = process.platform, realpath = realpathSync.native } = {}
) {
  const normalize = (path) => {
    const canonicalPath = realpath(resolve(path));
    return platform === 'win32' ? canonicalPath.toLowerCase() : canonicalPath;
  };
  return normalize(left) === normalize(right);
}
