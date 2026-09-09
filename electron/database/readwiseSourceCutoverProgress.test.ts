// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDesktopDeviceProfileFixture } from './deviceIdentityTestSupport.js';
import {
  loadReadwiseSourceMigrationProgress,
  writeReadwiseSourceCutover
} from './readwiseSourceCutover.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-progress-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('This Mac');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('counts every existing relay Topic in source migration progress', () => {
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO nodes (id,parent_id,kind,title,is_title_manual,content,anchor_link,created_at,updated_at)
    VALUES ('topic-1',NULL,'topic','Article',0,'legacy',NULL,'old','old'),
      ('topic-2',NULL,'topic','Book without highlights',0,'legacy',NULL,'old','old')`);
  driver.execute(`INSERT INTO desktop_sources (source_ref,source_type,config_ref,host_name,host_platform,
    root_path,path_flavor,type_settings_json,created_at,updated_at) VALUES
    ('readwise:local','readwise','articles-local','This Mac','darwin','/Readwise','posix','{}','old','old')`);
  driver.execute(`INSERT INTO import_sources (source_fingerprint,provider,source_kind,source_name,source_locator,
    first_imported_at,last_imported_at,last_content_fingerprint,latest_node_id,source_ref,source_location) VALUES
    ('source-1','desktop_text_file','markdown','Article.md','/Readwise/Article.md','old','old','hash-1',
     'topic-1','readwise:local','Article.md'),
    ('source-2','desktop_text_file','markdown','Book.md','/Readwise/Book.md','old','old','hash-2',
     'topic-2','readwise:local','Book.md')`);
  writeReadwiseSourceCutover({
    annotations: [], cohortDocumentIds: ['document-1'], completedAt: 'old',
    documents: [{ nodeId: 'topic-1', remoteId: 'document-1', status: 'bound' }],
    retiredNodeIds: [], sourceHost: 'This Mac', startedAt: 'old', status: 'migration-in-progress'
  });

  expect(loadReadwiseSourceMigrationProgress()).toEqual({ completedCount: 1, totalCount: 2 });
});
