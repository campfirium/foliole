// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import { readBodyPartIds } from '../../lib/core/database/partitionedNodeBody.js';
import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import { resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';

import { listNodeAttachments } from './attachments.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { runPreparedImport } from './importPipeline.js';
import { initializeDatabase } from './migrate.js';

// A valid PNG header followed by enough bytes to exceed the body budget once encoded.
const BIG_PNG = Buffer.concat([
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yZB8AAAAASUVORK5CYII=', 'base64'),
  Buffer.alloc(1_500_000, 1)
]);

beforeEach(async () => {
  mockedAppDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-data-images-'));
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(mockedAppDataDir, { recursive: true, force: true });
});

function prepare() {
  return createPreparedDesktopTextImport({
    content: `# Article\n\n![Big](data:image/png;base64,${BIG_PNG.toString('base64')})\n\nKeep ==this sentence== marked.`,
    degradedReason: null, fileName: 'big.md', filePath: '/source/big.md', highlightPolicy: 'adopt',
    importedAt: '2026-11-28T00:00:00.000Z', kind: 'markdown'
  });
}

it('stores an oversized inline image as an attachment instead of splitting the body', async () => {
  const imported = runPreparedImport(prepare());
  const nodeId = imported.nodeId!;
  const driver = openDatabaseConnection().driver;
  const content = loadNodeBodyResolution(driver, nodeId)!.content;
  const [attachment] = listNodeAttachments(nodeId);

  expect(imported.resultStatus).toBe('imported');
  expect(readBodyPartIds(driver, nodeId)).toEqual([]);
  expect(content).toContain(`![Big](asset://${attachment!.attachmentId}.png)`);
  expect(content).not.toContain('base64');
  expect(await fs.readFile(resolveAttachmentStoragePath(attachment!.attachmentId, undefined, 'image/png'))).toEqual(BIG_PNG);

  const child = driver.queryOne<{ anchor_link: string }>(
    'SELECT anchor_link FROM nodes WHERE parent_id = ? AND anchor_link IS NOT NULL', [nodeId])!;
  const anchor = JSON.parse(child.anchor_link) as { locator: { from: number; to: number } };
  expect(content.slice(anchor.locator.from, anchor.locator.to)).toBe('this sentence');

  expect(runPreparedImport(prepare()).duplicateSemantic).toBe('duplicate');
  expect(loadNodeBodyResolution(driver, nodeId)!.content).toBe(content);
});

it('stores oversized reference and bare img data images as attachments', () => {
  const url = `data:image/png;base64,${BIG_PNG.toString('base64')}`;
  const prepared = () => createPreparedDesktopTextImport({
    content: `# Article\n\n![Ref][pic]\n\n<img src="${url}" alt="Raw" width="200">\n\nKeep ==this sentence== marked.\n\n[pic]: ${url}\n`,
    degradedReason: null, fileName: 'forms.md', filePath: '/source/forms.md', highlightPolicy: 'adopt',
    importedAt: '2026-11-28T00:00:00.000Z', kind: 'markdown'
  });
  const imported = runPreparedImport(prepared());
  const nodeId = imported.nodeId!;
  const driver = openDatabaseConnection().driver;
  const content = loadNodeBodyResolution(driver, nodeId)!.content;
  const [attachment] = listNodeAttachments(nodeId);
  const asset = `asset://${attachment!.attachmentId}.png`;

  expect(listNodeAttachments(nodeId)).toHaveLength(1);
  expect(readBodyPartIds(driver, nodeId)).toEqual([]);
  expect(content).toContain(`![Ref](${asset})\n\n![Raw|200](${asset})`);
  expect(content).not.toContain('base64');

  const child = driver.queryOne<{ anchor_link: string }>(
    'SELECT anchor_link FROM nodes WHERE parent_id = ? AND anchor_link IS NOT NULL', [nodeId])!;
  const anchor = JSON.parse(child.anchor_link) as { locator: { from: number; to: number } };
  expect(content.slice(anchor.locator.from, anchor.locator.to)).toBe('this sentence');

  expect(runPreparedImport(prepared()).duplicateSemantic).toBe('duplicate');
  expect(loadNodeBodyResolution(driver, nodeId)!.content).toBe(content);
});
