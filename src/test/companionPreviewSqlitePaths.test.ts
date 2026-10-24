// @vitest-environment node
import { expect, it } from 'vitest';

import { createDocumentSqliteHost } from '../../scripts/vite/companionPreviewSqliteDatabase';

it.each([
  'C:\\Users\\Reader\\Preview #1\\foliole-companionSQLite.db',
  '/Users/reader/Preview #1/foliole-companionSQLite.db'
])('preserves the host database path without interpreting it as a URL: %s', (file) => {
  const database = createDocumentSqliteHost(file);
  const target = { database: 'foliole-companion' };
  try {
    database.call('createConnection', target);
    expect(database.call('getUrl', target)).toEqual({ url: file });
  } finally { database.close(); }
});
