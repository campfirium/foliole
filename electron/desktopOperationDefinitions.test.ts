// @vitest-environment node
import { readFile } from 'node:fs/promises';

import { expect, it } from 'vitest';

import {
  listDesktopOperationDefinitions,
  renderDesktopOperationMarkdownTable
} from './desktopOperationDefinitions.js';

it('keeps every registered operation executable and auditable from one definition', () => {
  const definitions = listDesktopOperationDefinitions();

  expect(definitions).toHaveLength(12);
  for (const definition of definitions) {
    expect(definition).toMatchObject({
      blocksStartup: false,
      concurrencyKey: expect.any(String),
      completion: expect.any(String),
      evidence: expect.any(String),
      recovery: expect.any(String),
      resources: expect.arrayContaining([{ resource: 'total' }]),
      trigger: expect.any(String),
      verification: expect.any(String),
      workload: expect.any(String)
    });
  }
  const table = renderDesktopOperationMarkdownTable();
  expect(table.split('\n')).toHaveLength(definitions.length + 2);
  expect(table).toContain('| managed-inbox-import |');

  const mainDatabaseOperations = definitions.filter((definition) => [
    'automatic-backup', 'keep-import', 'managed-inbox-import', 'mirror-backfill',
    'mirror-incremental', 'pdf-indexing', 'readwise-api-import', 'search-index-incremental',
    'search-index-rebuild'
  ].includes(definition.name));
  for (const definition of mainDatabaseOperations) {
    expect(definition.resources).toContainEqual({ resource: 'main-database-write' });
  }
});

it('routes known heavy entry points through the registered operation API', async () => {
  const routedFiles = [
    'database/pdfIndexingTaskQueue.ts',
    'database/searchIndexInvalidationScheduler.ts',
    'externalSearchBackgroundRefreshRuntime.ts',
    'import/importMonitorTaskScheduler.ts',
    'ipc/searchIndexRebuild.ts',
    'mirror/mirrorSyncScheduler.ts'
  ];
  for (const file of routedFiles) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    expect(source).toContain('submitDesktopOperation');
    expect(source).not.toContain('desktopTaskScheduler.submit');
  }
});
