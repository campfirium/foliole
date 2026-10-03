import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { measureKnownReadingPage, seedKnownReadingPage
} from '../../src/companion/syncPageApplyAcceptance.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

it('replays a real 32-state reading page without applying known objects', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-page-'));
  const receiver = new Database(':memory:');
  const pack = new Database(path.join(root, 'pack.db'));
  try {
    const port = createBetterSqliteDbPort(receiver);
    await seedKnownReadingPage(port, createBetterSqliteDbPort(pack));
    pack.close();
    await port.run('ATTACH DATABASE ? AS inc', [path.join(root, 'pack.db')]);
    try {
      const result = await measureKnownReadingPage(port);
      expect(result).toMatchObject({ facts: 32, appliedObjects: 0 });
      expect(result.queries).toBeGreaterThan(0);
      expect(receiver.prepare("SELECT COUNT(*) AS count FROM node_reading").get())
        .toEqual({ count: 32 });
    } finally { await port.run('DETACH DATABASE inc'); }
  } finally {
    if (pack.open) pack.close();
    receiver.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
