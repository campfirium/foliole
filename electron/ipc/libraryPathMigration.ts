import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { LibraryPathOverrides, ResolvedLibraryPaths } from '../../lib/platform/libraryPaths.js';
import { closeDatabaseConnection } from '../database/connection.js';

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function moveFile(sourcePath: string, targetPath: string) {
  if (sourcePath === targetPath) {
    return;
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  if (!(await pathExists(targetPath))) {
    try {
      await fs.rename(sourcePath, targetPath);
      return;
    } catch (error) {
      if (!isRecoverableMoveError(error)) {
        throw error;
      }
    }
  }

  if (await pathExists(targetPath)) {
    const [sourceBytes, targetBytes] = await Promise.all([fs.readFile(sourcePath), fs.readFile(targetPath)]);
    if (!sourceBytes.equals(targetBytes)) {
      throw new Error(`library path move conflict: ${targetPath}`);
    }
    await fs.unlink(sourcePath);
    return;
  }

  await fs.copyFile(sourcePath, targetPath);
  await fs.unlink(sourcePath);
}

function isRecoverableMoveError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = 'code' in error ? error.code : null;
  return code === 'EXDEV' || code === 'EEXIST' || code === 'ENOTEMPTY';
}

async function moveDirectoryContents(sourcePath: string, targetPath: string) {
  if (sourcePath === targetPath) {
    return;
  }

  if (!(await pathExists(sourcePath))) {
    await fs.mkdir(targetPath, { recursive: true });
    return;
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  if (!(await pathExists(targetPath))) {
    try {
      await fs.rename(sourcePath, targetPath);
      return;
    } catch (error) {
      if (!isRecoverableMoveError(error)) {
        throw error;
      }
    }
  }

  await fs.mkdir(targetPath, { recursive: true });
  const entries = await fs.readdir(sourcePath, { withFileTypes: true });
  for (const entry of entries) {
    const currentSourcePath = path.join(sourcePath, entry.name);
    const currentTargetPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      await moveDirectoryContents(currentSourcePath, currentTargetPath);
      continue;
    }
    await moveFile(currentSourcePath, currentTargetPath);
  }
  await fs.rm(sourcePath, { recursive: true, force: true });
}

function isPathInside(parentPath: string, candidatePath: string) {
  const relative = path.relative(parentPath, candidatePath);
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function shouldMoveDefaultScopedPath(currentValue: string | null, nextValue: string | null) {
  return currentValue === null && nextValue === null;
}

async function shouldAdoptExistingLibrary(args: {
  confirmExistingLibraryHome?: boolean;
  location: keyof LibraryPathOverrides;
  nextPaths: ResolvedLibraryPaths;
}) {
  return (
    args.confirmExistingLibraryHome === true &&
    args.location === 'library_home' &&
    (await pathExists(args.nextPaths.database_path))
  );
}

async function assertExistingLibraryConfirmed(args: {
  confirmExistingLibraryHome?: boolean;
  location: keyof LibraryPathOverrides;
  nextPaths: ResolvedLibraryPaths;
}) {
  if (
    args.confirmExistingLibraryHome !== true &&
    args.location === 'library_home' &&
    (await pathExists(args.nextPaths.database_path))
  ) {
    throw new Error('existing_library_home_requires_confirmation');
  }
}

export async function migrateLibraryPathChange(args: {
  currentOverrides: LibraryPathOverrides;
  currentPaths: ResolvedLibraryPaths;
  confirmExistingLibraryHome?: boolean;
  location: keyof LibraryPathOverrides;
  nextOverrides: LibraryPathOverrides;
  nextPaths: ResolvedLibraryPaths;
}) {
  const { confirmExistingLibraryHome, currentOverrides, currentPaths, location, nextOverrides, nextPaths } = args;

  if (location === 'assets_dir') {
    if (isPathInside(currentPaths.assets_dir, nextPaths.assets_dir)) {
      throw new Error('Target Assets folder cannot be inside the current Assets folder.');
    }
    await moveDirectoryContents(currentPaths.assets_dir, nextPaths.assets_dir);
    return;
  }

  if (location === 'inbox') {
    if (isPathInside(currentPaths.inbox, nextPaths.inbox)) {
      throw new Error('Target Inbox folder cannot be inside the current Inbox folder.');
    }
    await moveDirectoryContents(currentPaths.inbox, nextPaths.inbox);
    return;
  }

  if (location === 'mirror') {
    if (isPathInside(currentPaths.mirror, nextPaths.mirror)) {
      throw new Error('Target Mirror folder cannot be inside the current Mirror folder.');
    }
    await moveDirectoryContents(currentPaths.mirror, nextPaths.mirror);
    return;
  }

  if (location !== 'library_home') {
    return;
  }

  closeDatabaseConnection();
  await assertExistingLibraryConfirmed({ confirmExistingLibraryHome, location, nextPaths });
  if (await shouldAdoptExistingLibrary({ confirmExistingLibraryHome, location, nextPaths })) {
    return;
  }

  await moveDirectoryContents(currentPaths.data_dir, nextPaths.data_dir);

  if (shouldMoveDefaultScopedPath(currentOverrides.assets_dir, nextOverrides.assets_dir)) {
    await moveDirectoryContents(currentPaths.assets_dir, nextPaths.assets_dir);
  }
  if (shouldMoveDefaultScopedPath(currentOverrides.inbox, nextOverrides.inbox)) {
    await moveDirectoryContents(currentPaths.inbox, nextPaths.inbox);
  }
  if (shouldMoveDefaultScopedPath(currentOverrides.mirror, nextOverrides.mirror)) {
    await moveDirectoryContents(currentPaths.mirror, nextPaths.mirror);
  }
}
