// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { parseStoredAnchorLink } from '../../lib/core/database/anchorLinkCodec.js';
import type { NativeWorkspaceAnchorLink } from '../../lib/platform/nativeWorkspaceNodeContract.js';

import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

const anchor: NativeWorkspaceAnchorLink = { id: 'pdf-cross-page', kind: 'highlight', locator: {
  pages: [1, 3, 8].map(page => ({ page, x: 0.2, y: 0.3, rects: [{ x: 0.1, y: 0.2, width: 0.2, height: 0.1 }] }))
} };

function readAnchor(databasePath: string) {
  const db = new Database(databasePath, { readonly: true });
  try {
    const raw = db.prepare('SELECT anchor_link FROM nodes WHERE id = ?').pluck().get('pdf-excerpt');
    if (typeof raw !== 'string') throw new Error('Missing persisted excerpt');
    return parseStoredAnchorLink(raw);
  } finally { db.close(); }
}

it('keeps every page through IPC validation, SQLite, hydrate, editing, HTTP sync and process restart', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  try {
    await fixture.left.seed({ nodeId: 'pdf-source', title: 'PDF', content: '' });
    const first = await fixture.left.seed({ nodeId: 'pdf-excerpt', parentNodeId: 'pdf-source',
      title: 'Excerpt', content: 'First\nMiddle\nLast', anchorLink: anchor });
    expect(first.workspace).toMatchObject({ nodesById: { 'pdf-excerpt': { anchorLink: anchor } } });
    expect(readAnchor(first.databasePath)).toEqual(anchor);
    expect(await fixture.left.synchronize(fixture.rightSnapshot.origin)).toEqual({ complete: true });
    expect(readAnchor(fixture.rightSnapshot.databasePath)).toEqual(anchor);
    const received = await fixture.right.snapshot();
    expect(received.workspace).toMatchObject({ nodesById: { 'pdf-excerpt': { anchorLink: anchor } } });
    await fixture.right.seed({ nodeId: 'pdf-excerpt', parentNodeId: 'pdf-source',
      title: 'Edited title', content: 'Edited excerpt', anchorLink: anchor });
    expect(await fixture.right.synchronize(fixture.leftSnapshot.origin)).toEqual({ complete: true });
    expect(readAnchor(fixture.leftSnapshot.databasePath)).toEqual(anchor);
    const restarted = await fixture.restartLeft();
    expect(restarted.snapshot.workspace).toMatchObject({ nodesById: { 'pdf-excerpt': { anchorLink: anchor, title: 'Edited title' } } });
    expect(readAnchor(restarted.snapshot.databasePath)).toEqual(anchor);
    await fixture.restartRight();
    expect(readAnchor(fixture.rightSnapshot.databasePath)).toEqual(anchor);
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 60_000);
