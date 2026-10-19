// @vitest-environment node
import { expect, it } from 'vitest';

import { createDisplayLibrary } from '../sync/workspace-state/companionDisplaySnapshotConcurrency.testSupport';

import { readCompanionAttachmentReferences } from './companionAttachmentReferenceSnapshot';

it('allows a committed write during the readonly scan and rejects its stale conclusion', async () => {
  const library = createDisplayLibrary('android');
  try {
    await library.owner.open({ expectedHostName: 'scan-fixture', now: '2026-10-19T00:00:00.000Z' });
    await library.owner.runWriter(db => db.run("INSERT INTO nodes (id, title, content, created_at, updated_at) VALUES ('a', 'A', '', 'now', 'now')"));
    const original = library.owner.readSnapshot.bind(library.owner);
    let wroteDuringScan = false;
    library.owner.readSnapshot = (task, signal) => original(async db => {
      await db.query('SELECT id FROM nodes');
      await library.owner.runWriter(writer => writer.run("UPDATE nodes SET title = 'Edited' WHERE id = 'a'"));
      wroteDuringScan = true;
      return task(db);
    }, signal);
    await expect(readCompanionAttachmentReferences(library.owner)).rejects.toThrow('attachment_scan_foreground_write');
    expect(wroteDuringScan).toBe(true);
    expect(await library.owner.read(db => db.query("SELECT title FROM nodes WHERE id = 'a'")))
      .toEqual([{ title: 'Edited' }]);
  } finally { await library.close(); }
}, 10000);

it('returns references for an unchanged library and rejects cancellation', async () => {
  const library = createDisplayLibrary('android');
  try {
    await library.owner.open({ expectedHostName: 'scan-fixture', now: '2026-10-19T00:00:00.000Z' });
    expect((await readCompanionAttachmentReferences(library.owner)).storageKeys).toEqual([]);
    await expect(readCompanionAttachmentReferences(library.owner, AbortSignal.abort(new Error('user-active'))))
      .rejects.toThrow('user-active');
  } finally { await library.close(); }
});
