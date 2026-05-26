// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { migrateDatabaseFileNames } from './databaseFileNameMigration.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-db-file-name-migration-'));
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('renames legacy database file groups before sqlite opens them', async () => {
  await writeFileGroup('foliole-search.db', 'search');
  await writeFileGroup('external-search-cache.db', 'external');

  const results = migrateDatabaseFileNames(tempRoot);

  expect(results.map((result) => result.status)).toEqual(['migrated', 'migrated']);
  await expectFileGroup('foliole-index.db', 'search');
  await expectFileGroup('foliole-external.db', 'external');
  await expectMissingFileGroup('foliole-search.db');
  await expectMissingFileGroup('external-search-cache.db');
});

it('treats missing sqlite sidecars as a normal legacy group', async () => {
  await fs.writeFile(path.join(tempRoot, 'foliole-search.db'), 'search');

  migrateDatabaseFileNames(tempRoot);

  await expect(fs.readFile(path.join(tempRoot, 'foliole-index.db'), 'utf8')).resolves.toBe('search');
  await expect(fs.access(path.join(tempRoot, 'foliole-index.db-wal'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('keeps the final file name and archives the older group when both names exist', async () => {
  await fs.writeFile(path.join(tempRoot, 'external-search-cache.db'), 'legacy');
  await fs.writeFile(path.join(tempRoot, 'foliole-external.db'), 'next');
  await fs.utimes(
    path.join(tempRoot, 'external-search-cache.db'),
    new Date('2026-05-27T00:00:00.000Z'),
    new Date('2026-05-27T00:00:00.000Z')
  );
  await fs.utimes(
    path.join(tempRoot, 'foliole-external.db'),
    new Date('2026-05-26T00:00:00.000Z'),
    new Date('2026-05-26T00:00:00.000Z')
  );

  const results = migrateDatabaseFileNames(tempRoot);

  expect(results[1]?.status).toBe('conflict_resolved');
  await expect(fs.readFile(path.join(tempRoot, 'foliole-external.db'), 'utf8')).resolves.toBe('legacy');
  await expect(fs.access(path.join(tempRoot, 'external-search-cache.db'))).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await readArchiveContent('foliole-external')).toBe('next');
});

it('removes empty legacy groups when the new database already exists', async () => {
  await fs.writeFile(path.join(tempRoot, 'foliole-search.db'), '');
  await fs.writeFile(path.join(tempRoot, 'foliole-search.db-wal'), '');
  await fs.writeFile(path.join(tempRoot, 'foliole-index.db'), 'next');

  const results = migrateDatabaseFileNames(tempRoot);

  expect(results[0]?.status).toBe('skipped');
  await expect(fs.readFile(path.join(tempRoot, 'foliole-index.db'), 'utf8')).resolves.toBe('next');
  await expectMissingFileGroup('foliole-search.db');
});

async function writeFileGroup(fileName: string, marker: string) {
  await fs.writeFile(path.join(tempRoot, fileName), `${marker}-db`);
  await fs.writeFile(path.join(tempRoot, `${fileName}-wal`), `${marker}-wal`);
  await fs.writeFile(path.join(tempRoot, `${fileName}-shm`), `${marker}-shm`);
}

async function expectFileGroup(fileName: string, marker: string) {
  await expect(fs.readFile(path.join(tempRoot, fileName), 'utf8')).resolves.toBe(`${marker}-db`);
  await expect(fs.readFile(path.join(tempRoot, `${fileName}-wal`), 'utf8')).resolves.toBe(`${marker}-wal`);
  await expect(fs.readFile(path.join(tempRoot, `${fileName}-shm`), 'utf8')).resolves.toBe(`${marker}-shm`);
}

async function expectMissingFileGroup(fileName: string) {
  await expect(fs.access(path.join(tempRoot, fileName))).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(fs.access(path.join(tempRoot, `${fileName}-wal`))).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(fs.access(path.join(tempRoot, `${fileName}-shm`))).rejects.toMatchObject({ code: 'ENOENT' });
}

async function readArchiveContent(stem: string) {
  const fileNames = await fs.readdir(tempRoot);
  const archiveName = fileNames.find((fileName) => fileName.startsWith(`${stem}.pre-filename-migration-`));
  if (!archiveName) {
    throw new Error(`missing archive for ${stem}`);
  }
  return fs.readFile(path.join(tempRoot, archiveName), 'utf8');
}
