// @vitest-environment node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import type { NativeLibraryPaths } from '../../lib/platform/nativeUtilityContract.js';

import { migrateLegacyDefaultInbox } from './libraryPathLegacyInboxMigration.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-legacy-inbox-migration-'));
});

afterEach(async () => {
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function createPaths(libraryHome: string): NativeLibraryPaths {
  return {
    assets_dir: path.join(libraryHome, 'Assets'),
    data_dir: path.join(libraryHome, 'Data'),
    database_path: path.join(libraryHome, 'Data', 'foliole.db'),
    inbox: path.join(libraryHome, 'Import', 'Inbox'),
    library_home: libraryHome,
    mirror: path.join(libraryHome, 'Mirror'),
    updated_at: '1970-01-01T00:00:00.000Z'
  };
}

it('moves legacy default Inbox contents into Import/Inbox', async () => {
  const libraryHome = path.join(tempRoot, 'Foliole');
  const legacyInbox = path.join(libraryHome, 'Inbox');
  const nextInbox = path.join(libraryHome, 'Import', 'Inbox');
  await fs.mkdir(legacyInbox, { recursive: true });
  await fs.writeFile(path.join(legacyInbox, 'draft.md'), '# draft', 'utf8');

  migrateLegacyDefaultInbox(createPaths(libraryHome));

  await expect(fs.readFile(path.join(nextInbox, 'draft.md'), 'utf8')).resolves.toBe('# draft');
  await expect(fs.access(legacyInbox)).rejects.toThrow();
});
