// @vitest-environment node
import fs from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { DEFAULT_SUPER_MEMO_SOURCE_FORMAT } from '../../lib/core/import/superMemoSourceFormatting.js';
import type { SuperMemoMigrationPanel } from '../../lib/platform/nativeSuperMemoImportContract.js';

import { authorizeSelectedImportFilePath, resetImportPathAuthorizationForTests } from './importPathAuthorization.js';
import { migrationStorePath } from './superMemoMigrationStore.js';
import { activateSavedSuperMemoSource, getSuperMemoSourceSelection, handleSuperMemoSource } from './superMemoSourceLink.js';

const location = vi.hoisted(() => ({ userData: '', database: '' }));
vi.mock('electron', () => ({ app: { getPath: () => location.userData }, dialog: {} }));
vi.mock('../database/connection.js', () => ({ resolveDatabasePath: () => location.database }));

const snapshot = { elements: [], preview: { referenceDay: '2026-11-24', rows: [] } };
const batchId = 'a'.repeat(64);
let first: string;
let second: string;

beforeEach(async () => {
  const fixtures = path.resolve('.tmp/artifacts/T858-6/supermemo-tests');
  await mkdir(fixtures, { recursive: true });
  location.userData = await realpath(await mkdtemp(path.join(fixtures, 'case-')));
  location.database = path.join(location.userData, 'library.db');
  first = path.join(location.userData, 'active.xml');
  second = path.join(location.userData, 'older.xml');
  for (const xml of [first, second]) {
    await writeFile(xml, 'sample export');
    await authorizeSelectedImportFilePath(xml);
  }
});

afterEach(async () => {
  vi.restoreAllMocks();
  resetImportPathAuthorizationForTests();
  await rm(location.userData, { recursive: true, force: true });
});

function source(filePath: string, step: SuperMemoMigrationPanel['step']) {
  return {
    filePath, collectionDirectory: null, percent: 75, sourceFormat: DEFAULT_SUPER_MEMO_SOURCE_FORMAT,
    snapshot, xmlHash: 'b'.repeat(64), panel: { elementCount: 20, step }
  };
}

async function seedDrafts(legacy = false) {
  const file = migrationStorePath();
  const current = source(first, 'structure');
  const existing = JSON.stringify(legacy ? current : {
    activeFilePath: first,
    sources: { [first]: current, [second]: source(second, 'load') }
  });
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, existing);
  return { existing, file };
}

async function savePanel(filePath: string, panel: SuperMemoMigrationPanel) {
  return handleSuperMemoSource({ action: 'rememberPanel', collectionDirectory: null, filePath, panel });
}

it.each([false, true])('remembers new migration steps without opening or rewriting the draft history (legacy: %s)', async (legacy) => {
  const { existing, file } = await seedDrafts(legacy);
  expect(await getSuperMemoSourceSelection()).toMatchObject({ filePath: first, panel: { step: 'structure' } });

  const read = vi.spyOn(fs, 'readFileSync');
  const write = vi.spyOn(fs, 'writeFileSync');
  await Promise.all([savePanel(first, { step: 'schedule' }), savePanel(first, { step: 'grades' })]);
  expect(read.mock.calls.filter(([filename]) => filename === file)).toEqual([]);
  expect(write.mock.calls.filter(([filename]) => filename === file || filename === `${file}.partial`)).toEqual([]);
  expect(await readFile(file, 'utf8')).toBe(existing);
  vi.restoreAllMocks();

  vi.resetModules();
  const reopened = await import('./superMemoSourceLink.js');
  expect(await reopened.getSuperMemoSourceSelection()).toMatchObject({
    filePath: first, panel: { elementCount: 20, step: 'grades' }, savedForm: { percent: 75 }, snapshot
  });
});

it('keeps steps with their own source and lets an import result replace an old step', async () => {
  await seedDrafts();
  await getSuperMemoSourceSelection();
  await savePanel(first, { step: 'schedule' });

  expect(await activateSavedSuperMemoSource(second)).toMatchObject({ filePath: second, panel: { step: 'load' } });
  await expect(savePanel(first, { step: 'grades' })).rejects.toThrow('supermemo_source_changed');
  await savePanel(second, { step: 'structure' });
  expect(await activateSavedSuperMemoSource(first)).toMatchObject({ filePath: first, panel: { step: 'schedule' } });

  const result = { imported: 7, skipped: 2, unresolvedImages: 1 };
  const stepWrite = savePanel(first, { step: 'grades' });
  await handleSuperMemoSource({
    action: 'rememberPanel', collectionDirectory: null, filePath: first,
    panel: { batchId, result, step: 'complete' }, snapshot
  });
  await stepWrite;
  expect(await getSuperMemoSourceSelection()).toMatchObject({
    filePath: first, panel: { batchId, elementCount: 20, result, step: 'complete' }, snapshot
  });
  expect(await activateSavedSuperMemoSource(second)).toMatchObject({ filePath: second, panel: { step: 'structure' } });
});

it('remembers separate steps when two libraries use the same XML path', async () => {
  const firstLibrary = location.database;
  await seedDrafts();
  await getSuperMemoSourceSelection();
  const firstStep = savePanel(first, { step: 'schedule' });

  const secondLibrary = path.join(location.userData, 'other.db');
  location.database = secondLibrary;
  await seedDrafts();
  expect(await getSuperMemoSourceSelection()).toMatchObject({ filePath: first, panel: { step: 'structure' } });
  await savePanel(first, { step: 'grades' });
  await firstStep;

  location.database = firstLibrary;
  expect(await getSuperMemoSourceSelection()).toMatchObject({ filePath: first, panel: { step: 'schedule' } });
  location.database = secondLibrary;
  expect(await getSuperMemoSourceSelection()).toMatchObject({ filePath: first, panel: { step: 'grades' } });
});
