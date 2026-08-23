// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  readBootstrapSnapshot
} from './ios-bootstrap-acceptance-attempt.mjs';
import { resolveAcceptanceDatabasePath } from './ios-bootstrap-database-path.mjs';
import { waitForBootstrapSnapshotOrFailure } from './ios-simulator-acceptance-runner.mjs';

describe('iOS bootstrap acceptance database path', () => {
  it('uses the runtime-published database path inside the application container', () => {
    const container = '/simulator/data/Containers/Data/Application/app';
    const database = path.join(container, 'Library/CapacitorDatabase/foliole-companionSQLite.db');

    expect(resolveAcceptanceDatabasePath(container, { database_path: database })).toBe(database);
    expect(() => resolveAcceptanceDatabasePath(container, {})).toThrow('confined runtime database path');
    expect(() => resolveAcceptanceDatabasePath(container, { database_path: '/tmp/other.db' }))
      .toThrow('confined runtime database path');
  });
});

describe('iOS bootstrap database readiness', () => {
  it('surfaces a WebView startup failure while bootstrap readiness is pending', async () => {
    await expect(waitForBootstrapSnapshotOrFailure(
      () => ({ deviceId: '', tableCount: 0 }),
      () => 'content acceptance module failed to load',
      undefined,
      100
    )).rejects.toThrow('content acceptance module failed to load');
  });

  it('does not let the sqlite probe create the runtime database before the app', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-ios-bootstrap-path-'));
    const database = path.join(directory, 'foliole-companionSQLite.db');
    try {
      expect(() => readBootstrapSnapshot({ repoRoot: '/repo' }, database))
        .toThrow('has not been created yet');
      expect(fs.existsSync(database)).toBe(false);
    } finally {
      fs.rmSync(directory, { force: true, recursive: true });
    }
  });
});
