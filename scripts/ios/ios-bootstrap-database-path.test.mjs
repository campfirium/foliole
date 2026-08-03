// @vitest-environment node

import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveAcceptanceDatabasePath } from './ios-bootstrap-acceptance-attempt.mjs';

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
