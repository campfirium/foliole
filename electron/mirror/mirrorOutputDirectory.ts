import { promises as fs } from 'node:fs';
import path from 'node:path';

import { mirrorPathKey } from './mirrorPathIdentity.js';

export async function alignMirrorDirectorySpelling(previousPath: string, targetPath: string) {
  const previous = path.dirname(previousPath);
  const target = path.dirname(targetPath);
  if (previous === target || mirrorPathKey(previous) !== mirrorPathKey(target)) return;
  const root = path.parse(target).root;
  const oldSegments = path.relative(root, previous).split(path.sep);
  const newSegments = path.relative(root, target).split(path.sep);
  let parent = root;
  for (const [index, segment] of newSegments.entries()) {
    const oldPath = path.join(parent, oldSegments[index]!);
    const nextPath = path.join(parent, segment);
    if (oldPath !== nextPath) {
      try {
        const [before, after] = await Promise.all([fs.stat(oldPath), fs.stat(nextPath)]);
        if (before.dev === after.dev && before.ino === after.ino) await fs.rename(oldPath, nextPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    parent = nextPath;
  }
}

export async function removeEmptyMirrorParents(previousPath: string, mirrorRoot: string) {
  const root = path.resolve(mirrorRoot);
  let directory = path.resolve(path.dirname(previousPath));
  while (directory !== root) {
    const relative = path.relative(root, directory);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return;
    const parent = path.dirname(directory);
    if (parent === directory) return;
    try {
      await fs.rmdir(directory);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOTEMPTY' || code === 'EEXIST') return;
      if (code !== 'ENOENT') throw error;
    }
    directory = parent;
  }
}
