// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { readCompleteAttachmentReferenceKeys } from '../../lib/core/attachments/attachmentReferenceCache.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { buildDesktopFramedSyncFixture, createDesktopFramedSyncTwoProcessFixture }
  from './desktopFramedSyncTwoProcess.testSupport.js';

async function referenceKeys(databasePath: string) {
  const sqlite = new Database(databasePath, { readonly: true, fileMustExist: true });
  try { return await readCompleteAttachmentReferenceKeys(createBetterSqliteDbPort(sqlite)); }
  finally { sqlite.close(); }
}

it('collects a precompiled fixture through its production worker and retains referenced image bytes after restart', async () => {
  const buildRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-collection-build-'));
  const script = path.join(buildRoot, 'fixture.mjs');
  await buildDesktopFramedSyncFixture(script);
  const fixture = await createDesktopFramedSyncTwoProcessFixture(script, true, true);
  let succeeded = false;
  try {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const seeded = await fixture.left.seedResource({ bytes, includeImageInBody: true,
      nodeId: 'collection-referenced-image' });
    const asset = path.join(fixture.leftSnapshot.stateRoot, 'documents', 'Foliole', 'Assets', seeded.storageKey);
    await fixture.left.invoke('collect_content');
    expect(await referenceKeys(fixture.leftSnapshot.databasePath)).toContain(seeded.storageKey);
    expect(await fs.readFile(asset)).toEqual(bytes);
    const restarted = await fixture.restartLeft();
    await restarted.process.invoke('collect_content');
    expect(await referenceKeys(restarted.snapshot.databasePath)).toContain(seeded.storageKey);
    expect(await fs.readFile(asset)).toEqual(bytes);
    succeeded = true;
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    if (succeeded) await fs.rm(fixture.root, { recursive: true, force: true });
    else console.info('Precompiled collection fixture:', fixture.root);
    await fs.rm(buildRoot, { recursive: true, force: true });
  }
});
