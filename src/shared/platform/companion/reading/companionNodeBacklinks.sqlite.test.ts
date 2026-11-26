// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../../../../lib/core/sync/dbPort';

import { loadCompanionNodeBacklinks } from './companionNodeBacklinks';

const scope = vi.hoisted(() => ({ port: null as DbPort | null }));
vi.mock('../runtime/iosCompanionActiveDatabase', () => ({
  readIosCompanionDatabase: (task: (db: DbPort) => Promise<unknown>) => task(scope.port!)
}));

// Counts what crosses the native bridge: rows and JSON bytes returned to JS.
async function measure(title: string, padding: number) {
  const db = new Database(':memory:');
  const crossed = { rows: 0, bytes: 0 };
  try {
    db.exec('CREATE TABLE nodes (id TEXT PRIMARY KEY, title TEXT, content TEXT, deleted_at TEXT)');
    const insert = db.prepare('INSERT INTO nodes VALUES (?, ?, ?, NULL)');
    insert.run('target', title, '');
    insert.run('source', 'Source', `See [[ ${title.toUpperCase()} ]] here`);
    for (let index = 0; index < padding; index += 1) {
      insert.run(`pad-${index}`, `Pad ${index}`, `Linked [[Note ${index}]] and [[Some-topic]] ${'body '.repeat(80)}`);
    }
    scope.port = {
      query: async (sql: string, params: unknown[] = []) => {
        const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
        crossed.rows += rows.length;
        crossed.bytes += Buffer.byteLength(JSON.stringify(rows));
        return rows;
      }
    } as DbPort;
    const backlinks = await loadCompanionNodeBacklinks('target');
    expect(backlinks).toEqual([{
      sourceNodeId: 'source', sourceTitle: 'Source', context: `See [[ ${title.toUpperCase()} ]] here`, matchCount: 1
    }]);
    return crossed;
  } finally {
    scope.port = null;
    db.close();
  }
}

it.each(['Photosynthesis', 'Reading-List'])(
  'keeps backlink rows and bytes for %j independent of unrelated linked bodies', async (title) => {
    const small = await measure(title, 200);
    const large = await measure(title, 600);
    expect(large).toEqual(small);
    expect(large.rows).toBe(2);
  }
);
