import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { removeMirrorFileAndLegacyDirectory } from './mirrorOutputStorage.js';
import { collectProtectedMirrorPaths, mirrorPathKey } from './mirrorPathIdentity.js';

async function removeSeparateAlias(previousPath: string, targetPath: string, protectedPaths: Set<string>) {
  try {
    const [previous, target] = await Promise.all([fs.stat(previousPath), fs.stat(targetPath)]);
    if (previous.dev === target.dev && previous.ino === target.ino) {
      await fs.rename(previousPath, targetPath);
    } else if (!protectedPaths.has(mirrorPathKey(path.resolve(previousPath)))) {
      await fs.rm(previousPath, { force: true });
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export async function writeRenamedMirror(
  targetPath: string,
  markdown: string,
  previousPath: string,
  retirementProtectedPaths: () => Set<string>
) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const temporaryPath = path.join(path.dirname(targetPath), `.foliole-mirror-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporaryPath, markdown, 'utf8');
    await fs.rename(temporaryPath, targetPath);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
  const protectedPaths = retirementProtectedPaths();
  if (mirrorPathKey(previousPath) === mirrorPathKey(targetPath)) {
    await removeSeparateAlias(previousPath, targetPath, protectedPaths);
  } else {
    for (const key of collectProtectedMirrorPaths([targetPath])) protectedPaths.add(key);
    await removeMirrorFileAndLegacyDirectory(previousPath, protectedPaths);
  }
}
