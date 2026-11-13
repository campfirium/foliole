// @vitest-environment jsdom
import { readFileSync } from 'node:fs';

import { expect, it, vi } from 'vitest';

import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { readSuperMemoXmlDraft } from '../../lib/core/import/superMemoXmlDraft.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { publishAttachmentLibraryPathSnapshot, clearAttachmentLibraryPathSnapshot } from '../attachments/attachmentLibraryPathSnapshot.js';
import { authorizeSelectedImportDirectoryPath, resetImportPathAuthorizationForTests } from '../ipc/importPathAuthorization.js';
import { handleSuperMemoImportCommand } from '../ipc/superMemoImportCommands.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { restoreFixture } from './requestSyncRestoreRecovery.testSupport.js';

const connection = vi.hoisted(() => ({ driver: null as ReturnType<typeof createBetterSqlite3Driver> | null }));
vi.mock('./connection.js', () => ({
  openDatabaseConnection: () => connection,
  runWithDatabaseConnectionOwner: (fn: () => unknown) => fn()
}));


const xml = process.env.FOLIOLE_SUPERMEMO_VALIDATION_XML;
const collectionDirectory = process.env.FOLIOLE_SUPERMEMO_VALIDATION_COLLECTION;

const title = 'imports the complete Learning collection and reapplies its saved batch';
if (!xml || !collectionDirectory) {
  // SKIP: requires the private Learning export and collection | 2026-11-13 | revive: supply both validation paths
  it.skip(title, () => {});
} else it(title, { meta: { calibratedMs: 20_000 }, timeout: 180_000 }, async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source');
  try {
    const now = new Date().toISOString();
    source.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('host_name', JSON.stringify(source.id), now);
    connection.driver = createBetterSqlite3Driver(source.sqlite);
    bindParentOrderWriter(connection.driver, { deviceAnchor: source.id, libraryPath: source.file });
    publishAttachmentLibraryPathSnapshot({ assetsDir: fixture.root + '/assets', libraryScope: fixture.root });
    await authorizeSelectedImportDirectoryPath(collectionDirectory);
    const elements = readSuperMemoXmlDraft(new DOMParser().parseFromString(readFileSync(xml, 'utf8'), 'application/xml'));
    const args = { elements, collectionDirectory, percent: 0 };
    const started = performance.now();
    const result = await handleSuperMemoImportCommand(NATIVE_COMMANDS.runSuperMemoImport, args);
    if (!result || !('batchId' in result)) throw new Error('missing import result');
    expect(result).toMatchObject({ imported: 3434, skipped: 17, unresolvedImages: 320 });
    const nodeCount = source.sqlite.prepare('SELECT count(*) FROM nodes').pluck().get();
    expect(await handleSuperMemoImportCommand(NATIVE_COMMANDS.runSuperMemoImport, args)).toEqual(result);
    expect(source.sqlite.prepare('SELECT count(*) FROM nodes').pluck().get()).toBe(nodeCount);
    source.reopen();
    connection.driver = createBetterSqlite3Driver(source.sqlite);
    const count = source.sqlite.prepare('SELECT count(*) FROM review_log').pluck().get();
    expect(count).toBe(17_926);
    const adjust = (percent: number) => handleSuperMemoImportCommand(NATIVE_COMMANDS.adjustSuperMemoImport, { batchId: result.batchId, percent });
    const readDates = () => source.sqlite.prepare('SELECT node_id, due FROM node_review ORDER BY node_id').all();
    const before = readDates();
    const half = await adjust(50);
    expect(half).toMatchObject({ protectedItems: 0, updated: expect.any(Number) });
    expect(readDates()).not.toEqual(before);
    await adjust(100);
    await adjust(0);
    expect(readDates()).toEqual(before);
    process.stdout.write(`Learning verification ${JSON.stringify({
      ...result, reviews: count, half, elapsedMs: Math.round(performance.now() - started)
    })}\n`);
  } finally {
    clearAttachmentLibraryPathSnapshot();
    resetImportPathAuthorizationForTests();
    await fixture.close();
  }
});
