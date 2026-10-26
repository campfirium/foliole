// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { observeWorkspaceTestDatabaseLifecycle } from './workspaceTestDatabaseLifecycle.testSupport.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it('records the attached index before close and the closed native connection without retaining its handle', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-database-lifecycle-'));
  const output = path.join(root, 'connections.jsonl');
  vi.stubEnv('FOLIOLE_TEST_DB_LIFECYCLE_LOG', output);
  const snapshot = observeWorkspaceTestDatabaseLifecycle('cleanup');
  const db = new Database(path.join(root, 'source.db'));
  try {
    db.prepare('ATTACH DATABASE ? AS search').run(path.join(root, 'foliole-index.db'));
    db.close();
    snapshot();
    const events = fs.readFileSync(output, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    expect(events.find(event => event.event === 'before-close').databases)
      .toEqual(expect.arrayContaining([expect.objectContaining({ name: 'search', file: expect.stringContaining('foliole-index.db') })]));
    expect(events.find(event => event.event === 'after-close')).toMatchObject({ open: false, databases: [] });
    expect(events.at(-1)).toMatchObject({ event: 'before-peer-cleanup', open: false });
    expect(events[0].stack).toContain('workspaceTestDatabaseLifecycle.test.ts');
  } finally {
    if (db.open) db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
