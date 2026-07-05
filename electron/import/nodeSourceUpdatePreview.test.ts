// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-node-source-update-preview-tests';
const { notifyManagedInboxUpdated } = vi.hoisted(() => ({
  notifyManagedInboxUpdated: vi.fn()
}));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('./managedInboxEvents.js', () => ({
  notifyManagedInboxUpdated
}));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';

import { saveImportManagerSettings } from './importManagerSettings.js';
import {
  acceptPendingIncomingUpdate,
  dismissPendingIncomingUpdate
} from './incomingUpdateActions.js';
import {
  resolveIncomingUpdateTarget,
  upsertPendingIncomingUpdate
} from './incomingUpdates.js';
import { saveReadwiseKeepImportSettings, seedReadwiseArticleFixture } from './keepImportReadwiseTestSupport.js';
import { runKeepImportRule } from './keepImportService.js';
import { createGenericKeepImportConfig } from './keepImportService.test-support.js';
import { loadNodeSourceUpdatePreview, normalizeNodeSourcePreviewContent } from './nodeSourceUpdatePreview.js';
import { seedMirrorTopic } from './nodeSourceUpdatePreview.testSupport.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-node-source-update-preview-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('returns source update content after the readwise body changes upstream', async () => {
  const fixture = await seedReadwiseArticleFixture(tempRoot);
  saveReadwiseKeepImportSettings(fixture);
  await runKeepImportRule({
    directoryPath: fixture.fullDocumentDir,
    highlightPolicy: 'reference_only',
    ruleId: 'draft-import-source-1',
    sourceType: 'readwise'
  });

  await fs.writeFile(
    path.join(fixture.fullDocumentDir, 'Sample Article.md'),
    [
      '## Metadata',
      '- Author: Someone',
      '',
      '## Full Document',
      'Completely different upstream body.',
      '',
      'Another paragraph with Another matching excerpt. End.'
    ].join('\n'),
    'utf8'
  );
  await runKeepImportRule({
    directoryPath: fixture.fullDocumentDir,
    highlightPolicy: 'reference_only',
    ruleId: 'draft-import-source-1',
    sourceType: 'readwise'
  });

  const importedNode = openDatabaseConnection().sqlite
    .prepare(`SELECT latest_node_id FROM import_sources WHERE source_name = 'Sample Article.md'`)
    .get() as { latest_node_id: string };

  await expect(loadNodeSourceUpdatePreview(importedNode.latest_node_id)).resolves.toEqual({
    checked_at: expect.any(String),
    current_highlight_count: expect.any(Number),
    current_content: expect.stringContaining('This is the highlighted sentence.'),
    kind: 'source_update',
    source_node_id: importedNode.latest_node_id,
    updated_highlight_count: expect.any(Number),
    updated_content: expect.stringContaining('Completely different upstream body.')
  });
});

it('returns plain markdown updates for generic adopt imports after the source changes', async () => {
  const sourceDir = path.join(tempRoot, 'watched-source');
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, 'entry.md'), 'Before ==important== after', 'utf8');
  saveImportManagerSettings({
    sources: [
      {
        actionMode: 'keep',
        archivePath: '',
        id: 'draft-import-source-201',
        highlightMode: 'merged',
        highlightPath: '',
        keepPreview: null,
        keepState: 'enabled',
        primaryPath: sourceDir
      }
    ]
  });

  await runKeepImportRule(createGenericKeepImportConfig(sourceDir, 'draft-import-source-201', 'adopt'));
  await fs.writeFile(path.join(sourceDir, 'entry.md'), 'Before ==important== after again', 'utf8');
  await runKeepImportRule(createGenericKeepImportConfig(sourceDir, 'draft-import-source-201', 'adopt'));

  const importedNode = openDatabaseConnection().sqlite
    .prepare(`SELECT latest_node_id FROM import_sources WHERE source_name = 'entry.md'`)
    .get() as { latest_node_id: string };

  await expect(loadNodeSourceUpdatePreview(importedNode.latest_node_id)).resolves.toEqual({
    checked_at: expect.any(String),
    current_highlight_count: 1,
    current_content: 'Before important after',
    kind: 'source_update',
    source_node_id: importedNode.latest_node_id,
    updated_highlight_count: 1,
    updated_content: 'Before important after again'
  });
});

it('returns pending incoming updates before source-tracked updates', async () => {
  seedMirrorTopic({ id: 'topic-incoming-1', relativePath: 'Projects/Plan.md' });
  const incomingUpdateId = upsertPendingIncomingUpdate({
    importedAt: '2026-03-28T05:00:00.000Z',
    sourcePath: 'Projects/Plan.md',
    topicId: 'topic-incoming-1',
    updatedContent: 'Incoming import content'
  });

  await expect(loadNodeSourceUpdatePreview('topic-incoming-1')).resolves.toEqual({
    checked_at: '2026-03-28T05:00:00.000Z',
    current_highlight_count: 0,
    current_content: 'Current mirror content',
    incoming_update_id: incomingUpdateId,
    kind: 'incoming_update',
    source_node_id: 'topic-incoming-1',
    updated_highlight_count: 0,
    updated_content: 'Incoming import content'
  });
});

it('accepts pending incoming updates into the mirror topic and clears the pending row', async () => {
  seedMirrorTopic({ id: 'topic-incoming-accept', relativePath: 'Projects/Accept.md' });
  const incomingUpdateId = upsertPendingIncomingUpdate({
    importedAt: '2026-03-28T05:00:00.000Z',
    sourcePath: 'Projects/Accept.md',
    topicId: 'topic-incoming-accept',
    updatedContent: 'Incoming import content'
  });

  expect(acceptPendingIncomingUpdate({
    content: 'Accepted incoming content',
    id: incomingUpdateId
  })).toEqual({
    incoming_update_id: incomingUpdateId,
    node_id: 'topic-incoming-accept',
    status: 'accepted'
  });

  expect(openDatabaseConnection().driver.queryOne<{ content: string }>(
    `SELECT content FROM nodes WHERE id = ?`,
    ['topic-incoming-accept']
  )?.content).toBe('Accepted incoming content');
  await expect(loadNodeSourceUpdatePreview('topic-incoming-accept')).resolves.toBeNull();
});

it('dismisses pending incoming updates without changing the topic content', async () => {
  seedMirrorTopic({ id: 'topic-incoming-dismiss', relativePath: 'Projects/Dismiss.md' });
  const incomingUpdateId = upsertPendingIncomingUpdate({
    importedAt: '2026-03-28T05:00:00.000Z',
    sourcePath: 'Projects/Dismiss.md',
    topicId: 'topic-incoming-dismiss',
    updatedContent: 'Incoming import content'
  });

  expect(dismissPendingIncomingUpdate(incomingUpdateId)).toEqual({
    incoming_update_id: incomingUpdateId,
    node_id: 'topic-incoming-dismiss',
    status: 'dismissed'
  });

  expect(openDatabaseConnection().driver.queryOne<{ content: string }>(
    `SELECT content FROM nodes WHERE id = ?`,
    ['topic-incoming-dismiss']
  )?.content).toBe('Current mirror content');
  await expect(loadNodeSourceUpdatePreview('topic-incoming-dismiss')).resolves.toBeNull();
});

it('does not target mirror topics that already have anchor-derived children', () => {
  seedMirrorTopic({ id: 'topic-incoming-anchored', relativePath: 'Projects/Anchored.md' });
  upsertNodeSnapshot({
    anchorLink: {
      id: 'topic-incoming-anchored',
      kind: 'highlight',
      locator: { from: 0, originalText: 'Current', to: 7 }
    },
    content: 'Highlight child',
    createdAt: '2026-03-28T04:00:00.000Z',
    isTitleManual: true,
    kind: 'topic',
    nodeId: 'highlight-child-1',
    parentNodeId: 'topic-incoming-anchored',
    position: null,
    priority: null,
    reveal: null,
    title: 'Highlight child',
    updatedAt: '2026-03-28T04:00:00.000Z'
  });

  expect(resolveIncomingUpdateTarget({ relativePath: 'Projects/Anchored.md' })).toBeNull();
});

it('preserves plain markdown preview content without extra normalization branches', () => {
  expect(normalizeNodeSourcePreviewContent('Before important after')).toBe('Before important after');
  expect(normalizeNodeSourcePreviewContent('Before important\r\nafter')).toBe('Before important\nafter');
});
