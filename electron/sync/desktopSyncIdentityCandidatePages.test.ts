// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { readDesktopSyncIdentityCandidatePage } from './desktopSyncIdentityCandidatePages.js';

it('pages both candidate directions by global ID and chains page IDs', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-candidate-pages-'));
  const candidatePath = path.join(root, 'candidates.db');
  const db = new Database(candidatePath);
  try {
    db.exec(`CREATE TABLE candidates (object_type TEXT, object_id TEXT, kind TEXT,
      source_fingerprint TEXT, receiver_fingerprint TEXT)`);
    const insert = db.prepare('INSERT INTO candidates VALUES (?, ?, ?, ?, ?)');
    insert.run('node', 'older', 'source_only', 'a'.repeat(64), null);
    insert.run('node', 'receiver-only', 'receiver_only', null, 'c'.repeat(64));
    insert.run('node', 'same-id', 'divergent', 'b'.repeat(64), 'd'.repeat(64));
    const base = { candidatePath, groupId: 'group', sourcePeerId: 'source',
      targetPeerId: 'receiver', sourceViewId: '12345678-1234-1234-1234-123456789abc' };
    const first = readDesktopSyncIdentityCandidatePage({ ...base, pageIndex: 0,
      previousPageId: null, after: null, direction: 'source', limit: 1 });
    expect(first.page.objects.map((row) => row.object_id)).toEqual(['older']);
    expect(first.nextAfter).toEqual({ object_type: 'node', object_id: 'older' });
    const second = readDesktopSyncIdentityCandidatePage({ ...base, pageIndex: 1,
      previousPageId: first.page.page_id, after: first.nextAfter, direction: 'source', limit: 1 });
    expect(second.page.objects.map((row) => row.object_id)).toEqual(['same-id']);
    expect(second.page.previous_page_id).toBe(first.page.page_id);
    expect(second.nextAfter).toBeNull();
    const outbound = readDesktopSyncIdentityCandidatePage({ ...base,
      sourcePeerId: 'receiver', targetPeerId: 'source', direction: 'receiver',
      pageIndex: 0, previousPageId: null, after: null });
    expect(outbound.page.objects.map((row) => [row.object_id, row.fingerprint])).toEqual([
      ['receiver-only', 'c'.repeat(64)], ['same-id', 'd'.repeat(64)]
    ]);
  } finally {
    db.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
