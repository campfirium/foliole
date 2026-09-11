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
vi.mock('../database/readwiseHostAssignment.js', () => ({
  canCurrentHostRunReadwise: () => true,
  loadReadwiseHostAssignment: () => ({ current_host_name: 'This Mac', is_active: true })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { writeReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';

import { previewReadwiseSourceCutover } from './readwiseSourceCutover.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-cutover-preview-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('This Mac');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('counts only active Topics imported by this Host', async () => {
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO nodes (id,parent_id,kind,title,is_title_manual,content,created_at,updated_at)
    VALUES ('local-topic',NULL,'topic','Local',0,'body','old','old'),
      ('other-topic',NULL,'topic','Other',0,'body','old','old')`);
  driver.execute(`INSERT INTO desktop_sources (source_ref,source_type,config_ref,host_name,host_platform,
    root_path,path_flavor,type_settings_json,created_at,updated_at) VALUES
    ('readwise:local','readwise','articles-local','This Mac','darwin','/local','posix','{}','old','old'),
    ('readwise:other','readwise','articles-other','Other Mac','darwin','/other','posix','{}','old','old')`);
  driver.execute(`INSERT INTO import_sources (source_fingerprint,provider,source_kind,source_name,source_locator,
    first_imported_at,last_imported_at,last_content_fingerprint,latest_node_id,source_ref,source_location) VALUES
    ('local','desktop_text_file','markdown','Local.md','Local.md','old','old','hash','local-topic','readwise:local','Local.md'),
    ('other','desktop_text_file','markdown','Other.md','Other.md','old','old','hash','other-topic','readwise:other','Other.md')`);

  await expect(previewReadwiseSourceCutover()).resolves.toEqual({
    completed_count: 0, error_reason: null, phase: null, status: 'ready', topic_count: 1, total_count: null
  });
});

it('does not inspect relay directories before the user confirms migration', async () => {
  await expect(previewReadwiseSourceCutover()).resolves.toEqual({
    completed_count: 0, error_reason: null, phase: null, status: 'ready', topic_count: 0, total_count: null
  });
});

it('restores the merging phase from an unfinished durable cohort', async () => {
  writeReadwiseSourceCutover({
    annotations: [], cohortDocumentIds: ['document-1'], completedAt: '2026-09-09T01:00:00.000Z',
    documents: [], retiredNodeIds: [], sourceHost: 'This Mac',
    startedAt: '2026-09-09T00:00:00.000Z', status: 'migration-in-progress'
  });
  await expect(previewReadwiseSourceCutover()).resolves.toMatchObject({
    completed_count: 0, phase: 'merging', status: 'migration_in_progress', total_count: 1
  });
});

it('restores a reset migration as indexing until its Readwise index exists', async () => {
  writeReadwiseSourceCutover({
    annotations: [], cohortDocumentIds: [], completedAt: '2026-09-11T01:00:00.000Z',
    documents: [], retiredNodeIds: ['retired-1'], sourceHost: 'This Mac',
    startedAt: '2026-09-11T01:00:00.000Z', status: 'migration-in-progress'
  });
  await expect(previewReadwiseSourceCutover()).resolves.toMatchObject({
    completed_count: 0, phase: 'indexing', status: 'migration_in_progress', total_count: 0
  });
});

it('fails closed when the v2 journal is malformed even with a legacy sentinel', async () => {
  writeReadwiseSourceCutover({
    annotations: [], cohortDocumentIds: [], completedAt: '2026-09-09T01:00:00.000Z',
    documents: [], retiredNodeIds: [], sourceHost: 'This Mac',
    startedAt: '2026-09-09T00:00:00.000Z', status: 'api'
  });
  openDatabaseConnection().driver.execute(
    "UPDATE settings SET value='{' WHERE key='readwise_source_cutover_v2'"
  );
  await expect(previewReadwiseSourceCutover()).rejects.toThrow('invalid_json');
});
