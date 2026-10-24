// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import type { DbPort } from './dbPort.js';
import { assertCurrentNodeParentChain, assertCurrentNodeParentChains } from './syncNodeParentChain.js';

function nodes(parents: Record<string, string | null>): DbPort {
  const sqlite = new Database(':memory:');
  sqlite.exec('CREATE TABLE nodes (id TEXT PRIMARY KEY, parent_id TEXT)');
  for (const [id, parent] of Object.entries(parents)) sqlite.prepare('INSERT INTO nodes VALUES (?, ?)').run(id, parent);
  return {
    query: async (sql, params = []) => sqlite.prepare(sql).all(...params) as never,
    run: async (sql, params = []) => { const result = sqlite.prepare(sql).run(...params); return { changes: result.changes, lastInsertRowId: null }; },
    transaction: execute => execute(nodes(parents))
  };
}

async function single(db: DbPort, ids: string[]) {
  for (const id of ids) await assertCurrentNodeParentChain(db, id);
}

it.each([
  ['a chain ending at a root', { root: null, a: 'root', b: 'a' }, ['b', 'a'], false],
  ['a chain ending at a missing parent', { a: 'gone', b: 'a' }, ['b'], false],
  ['a missing start', { a: null }, ['missing'], false],
  ['a cycle through the start', { a: 'b', b: 'a' }, ['a'], true],
  ['a cycle above the start', { start: 'a', a: 'b', b: 'a' }, ['start'], true],
  ['one cyclic chain among clean ones', { root: null, ok: 'root', start: 'a', a: 'b', b: 'a' }, ['ok', 'start'], true]
] as const)('checks %s like the per-node walk', async (_name, parents, ids, cyclic) => {
  const db = nodes(parents as Record<string, string | null>);
  const expectation = (run: Promise<void>) => cyclic
    ? expect(run).rejects.toThrow('framed_sync_node_parent_cycle') : expect(run).resolves.toBeUndefined();
  await expectation(single(db, [...ids]));
  await expectation(assertCurrentNodeParentChains(db, ids));
});
