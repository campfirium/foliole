// @vitest-environment node
import fs from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import { resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';
import { listAttachmentNodeLinks, listNodeAttachments } from '../database/attachments.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { flushNodeSyncVersion } from '../database/nodeSyncVersions.js';
import { runDirectoryImportBatch } from '../import/directoryImportBatch.js';

import { discoverDirectoryImportSources } from './importSourcePipeline.js';
import { runImportForFilePath } from './importTextFile.js';

let root = '';
vi.mock('electron', () => ({
  dialog: { showOpenDialog: vi.fn() },
  shell: { trashItem: async (file: string) => {
    const target = path.join(root, 'trash', path.relative(path.join(root, 'source'), file));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.rename(file, target);
  } }
}));
vi.mock('../import/managedInboxEvents.js', () => ({ notifyManagedInboxUpdated: vi.fn() }));
vi.mock('./paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: root, app_cache_dir: path.join(root, 'cache'),
  app_config_dir: path.join(root, 'config'), app_log_dir: path.join(root, 'logs')
}) }));

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yZB8AAAAASUVORK5CYII=', 'base64');

beforeEach(async () => {
  const artifacts = path.resolve('.tmp/artifacts/T514');
  await fs.mkdir(artifacts, { recursive: true });
  root = await fs.mkdtemp(path.join(artifacts, 'html-images-'));
  await initializeDatabase(undefined, { recovery: 'fail' });
});
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

function readBody(nodeId: string) {
  return loadNodeBodyResolution(openDatabaseConnection().driver, nodeId)!.content;
}

async function createPage(name: string, src: string, body = 'Saved article') {
  const file = path.join(root, 'source', name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `<html><body><p>${body}</p><img src="${src}" alt="Figure"></body></html>`);
  return file;
}

async function expectDurableImage(nodeId: string) {
  const [attachment] = listNodeAttachments(nodeId);
  expect(attachment).toBeDefined();
  const storageKey = `${attachment!.attachmentId}.png`;
  expect(readBody(nodeId)).toContain(`![Figure](asset://${storageKey})`);
  const file = resolveAttachmentStoragePath(attachment!.attachmentId, undefined, 'image/png');
  expect(await fs.readFile(file)).toEqual(PNG);
  flushNodeSyncVersion(nodeId, new Date().toISOString());
  const version = openDatabaseConnection().driver.queryOne<{ snapshot_json: string }>(
    'SELECT v.snapshot_json FROM node_sync_versions v JOIN nodes n ON n.current_version_id = v.version_id WHERE n.id = ?', [nodeId]
  );
  expect(JSON.parse(version!.snapshot_json).resource_references).toContain(storageKey);
  return attachment!.attachmentId;
}

it.each(['saved_files/figure.png', 'saved files/figure (été).png', 'saved%20files/figure%20(%C3%A9t%C3%A9).png'])(
  'persists the HTML image %s independently of its source directory and database connection', async (src) => {
    const file = await createPage('page.html', src);
    const image = path.join(root, 'source', decodeURIComponent(src));
    await fs.mkdir(path.dirname(image), { recursive: true });
    await fs.writeFile(image, PNG);
    const result = await runImportForFilePath(file);
    expect(result.result_status).toBe('imported');
    expect(await fs.readFile(image)).toEqual(PNG);
    await fs.rm(path.join(root, 'source'), { recursive: true });
    closeDatabaseConnection();
    await initializeDatabase(undefined, { recovery: 'fail' });
    expect(readBody(result.node_id!)).toContain('Saved article');
    await expectDurableImage(result.node_id!);
  }
);

it.each(['clear', 'archive'] as const)(
  'localizes shared page images before %s consumes any source, even when the image is discovered first', async (policy) => {
    await createPage('z-first.html', 'a_files/figure.png', 'First article');
    await createPage('z-second.html', 'a_files/figure.png', 'Second article');
    const image = path.join(root, 'source', 'a_files', 'figure.png');
    await fs.mkdir(path.dirname(image));
    await fs.writeFile(image, PNG);
    const sourceRoot = path.join(root, 'source');
    const sources = await discoverDirectoryImportSources(sourceRoot, { includeLocalImages: true });
    expect(sources[0]?.importMode).toBe('local_image');
    const result = await runDirectoryImportBatch({
      consumePolicy: policy, highlightPolicy: 'reference_only', rootPath: sourceRoot,
      sourceAdapter: 'foliole_managed_inbox_folder', titleStrategy: 'file_name', sources
    });
    expect(result).toMatchObject({ imported_count: 3, failed_count: 0, consumed_count: 3 });
    for (const source of sources) await expect(fs.stat(source.filePath)).rejects.toThrow();
    await fs.rm(sourceRoot, { recursive: true, force: true });
    const pages = result.entries.filter((entry) => entry.source_kind === 'html');
    const hashes = await Promise.all(pages.map((page) => expectDurableImage(page.node_id!)));
    expect(new Set(hashes).size).toBe(1);
    expect(listAttachmentNodeLinks(hashes[0]!)).toHaveLength(3);
  }
);

it.each(['missing.png', 'broken.png'])(
  'reports an incomplete HTML image import for %s while keeping the readable body and manual source', async (src) => {
    const file = await createPage('incomplete.html', src);
    if (src === 'broken.png') await fs.writeFile(path.join(root, 'source', src), 'broken image');
    const original = await fs.readFile(file);
    const result = await runImportForFilePath(file);
    expect(result.result_status).toBe('degraded');
    expect(result.degraded_reason).toContain('HTML local image import degraded:');
    expect(readBody(result.node_id!)).toContain('Saved article');
    expect(readBody(result.node_id!)).toContain(`![Figure](${src})`);
    expect(listNodeAttachments(result.node_id!)).toEqual([]);
    expect(await fs.readFile(file)).toEqual(original);
  }
);

it('keeps remote and inline images without creating local attachments or downloading resources', async () => {
  const src = 'https://example.invalid/remote.png';
  const file = await createPage('remote.html', src);
  await fs.appendFile(file, `<img src="data:image/png;base64,${PNG.toString('base64')}" alt="Inline">`);
  const result = await runImportForFilePath(file);
  expect(result.result_status).toBe('imported');
  expect(readBody(result.node_id!)).toContain(src);
  expect(readBody(result.node_id!)).toContain(`data:image/png;base64,${PNG.toString('base64')}`);
  expect(listNodeAttachments(result.node_id!)).toEqual([]);
});
