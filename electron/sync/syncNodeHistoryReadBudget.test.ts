// @vitest-environment node
import { expect, it } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { isStoredAncestorVersion } from '../../lib/core/sync/syncNodeGraph.js';
import { loadAncestorDistances } from '../../lib/core/sync/syncNodeLineage.js';
import { prepareIncomingNodeVersionHistory } from '../../lib/core/sync/syncNodeVersionHistory.js';
import { restoreFixture } from '../database/requestSyncRestoreRecovery.testSupport.js';

import { branch, identity, receive } from './syncPackStoredVersionDependencies.testSupport.js';

it('validates retained history without a native database round trip per historical version', async () => {
  const fixture = await restoreFixture();
  try {
    const source = fixture.peer('source');
    const target = fixture.peer('target');
    const records = [branch('v0', 'first')];
    for (let index = 1; index < 84; index++) {
      records.push(branch(`v${index}`, `body ${index}`, records[index - 1]));
    }
    await receive(source, target, records);
    let reads = 0;
    const db = target.db;
    const measured: DbPort = { ...db, query: (sql, params) => { reads++; return db.query(sql, params); } };
    const next = branch('next', 'latest', records.at(-1));
    await prepareIncomingNodeVersionHistory(measured, [...records.map(identity), next]);
    expect(await isStoredAncestorVersion(measured, 'v0', 'v83')).toBe(true);
    expect(await isStoredAncestorVersion(measured, 'v83', 'v0')).toBe(false);
    expect(reads).toBeLessThanOrEqual(8);
    await receive(source, target, [...records.map(identity), next]);
    target.reopen();
    expect(target.sqlite.prepare("SELECT content FROM nodes WHERE id = 'node-1'").pluck().get()).toBe('latest');
    expect(target.sqlite.prepare('SELECT count(*) FROM node_sync_versions').pluck().get()).toBe(85);
  } finally { await fixture.close(); }
});

it('preserves explicit parent precedence, legacy gaps and cycle termination in ancestry queries', async () => {
  const fixture = await restoreFixture();
  try {
    const source = fixture.peer('source');
    const target = fixture.peer('target');
    const root = branch('root', 'root');
    const child = branch('child', 'child', root);
    const head = branch('head', 'head', child);
    await receive(source, target, [root, child, head]);
    target.sqlite.exec(`DELETE FROM node_sync_version_parents WHERE version_id = 'child';
      INSERT INTO node_sync_version_parents VALUES ('head', 'gap', 1);
      INSERT INTO node_sync_version_parents VALUES ('root', 'head', 0);`);
    for (const current of ['root', 'child', 'head', 'gap', 'absent']) {
      const expected = await loadAncestorDistances(target.db, current);
      for (const ancestor of ['root', 'child', 'head', 'gap', 'absent']) {
        expect(await isStoredAncestorVersion(target.db, ancestor, current)).toBe(expected.has(ancestor));
      }
    }
  } finally { await fixture.close(); }
});
