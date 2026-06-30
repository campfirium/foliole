import path from 'node:path';

import type { LibraryPathOverrides, ResolvedLibraryPaths } from '../../lib/platform/libraryPaths.js';
import { closeDatabaseConnection } from '../database/connection.js';
import { closeExternalSearchCacheDatabase } from '../database/externalSearchCacheDatabase.js';

import { moveDirectoryContents, pathExists } from './libraryPathFileMove.js';
import {
  beginLibraryHomeMigration,
  endLibraryHomeMigration,
  markLibraryHomeDatabaseMoved
} from './libraryPathMigrationRuntime.js';

function releaseLibraryMigrationDatabaseHandles() {
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
}

async function pauseExternalSearchRefresh() {
  const runtime = await import('../externalSearchBackgroundRefreshRuntime.js');
  await runtime.pauseExternalSearchBackgroundRefresh();
}

function isPathInside(parentPath: string, candidatePath: string) {
  const relative = path.relative(parentPath, candidatePath);
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function shouldMoveDefaultScopedPath(currentValue: string | null, nextValue: string | null) {
  return currentValue === null && nextValue === null;
}

async function shouldAdoptExistingLibrary(args: {
  confirmExistingLibraryHome: boolean;
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
  confirmExistingLibraryHome: boolean;
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

async function migrateLibraryHome(args: {
  confirmExistingLibraryHome: boolean;
  currentOverrides: LibraryPathOverrides;
  currentPaths: ResolvedLibraryPaths;
  nextOverrides: LibraryPathOverrides;
  nextPaths: ResolvedLibraryPaths;
}) {
  beginLibraryHomeMigration();
  try {
    await pauseExternalSearchRefresh();
    releaseLibraryMigrationDatabaseHandles();
    await assertExistingLibraryConfirmed({ ...args, location: 'library_home' });
    if (await shouldAdoptExistingLibrary({ ...args, location: 'library_home' })) {
      return;
    }

    await moveDirectoryContents(args.currentPaths.data_dir, args.nextPaths.data_dir, releaseLibraryMigrationDatabaseHandles);
    markLibraryHomeDatabaseMoved(args.currentPaths.database_path);

    if (shouldMoveDefaultScopedPath(args.currentOverrides.assets_dir, args.nextOverrides.assets_dir)) {
      await moveDirectoryContents(args.currentPaths.assets_dir, args.nextPaths.assets_dir, releaseLibraryMigrationDatabaseHandles);
    }
    if (shouldMoveDefaultScopedPath(args.currentOverrides.inbox, args.nextOverrides.inbox)) {
      await moveDirectoryContents(args.currentPaths.inbox, args.nextPaths.inbox, releaseLibraryMigrationDatabaseHandles);
    }
    if (shouldMoveDefaultScopedPath(args.currentOverrides.mirror, args.nextOverrides.mirror)) {
      await moveDirectoryContents(args.currentPaths.mirror, args.nextPaths.mirror, releaseLibraryMigrationDatabaseHandles);
    }
  } finally {
    endLibraryHomeMigration();
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
  const shouldConfirmExistingLibraryHome = confirmExistingLibraryHome === true;

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

  await migrateLibraryHome({
    confirmExistingLibraryHome: shouldConfirmExistingLibraryHome,
    currentOverrides,
    currentPaths,
    nextOverrides,
    nextPaths
  });
}
