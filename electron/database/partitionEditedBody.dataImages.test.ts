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
import { readBodyPartIds, readPartitionedNodeBody } from '../../lib/core/database/partitionedNodeBody.js';
import { UNIMPORTABLE_IMAGE_PLACEHOLDER } from '../../lib/core/import/importDataImages.js';
import { TEXT_BODY_MAX_BYTES, utf8ByteLength } from '../../lib/core/nodes/textBodyBudget.js';
import { resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';

import { listNodeAttachments } from './attachments.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { partitionEditedBody } from './partitionEditedBody.js';

// A valid PNG header followed by enough bytes to exceed the body budget once encoded.
const BIG_PNG = Buffer.concat([
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yZB8AAAAASUVORK5CYII=', 'base64'),
  Buffer.alloc(1_500_000, 1)
]);
const IMAGE = `![Big](data:image/png;base64,${BIG_PNG.toString('base64')})`;
const ORIGINAL = 'Intro.\n\nKeep this sentence marked.';
const NOW = '2026-11-28T00:00:00.000Z';

beforeEach(async () => {
  mockedAppDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-edit-data-images-'));
  await initializeDatabase();
  upsertNodeSnapshot({ anchorLink: null, content: ORIGINAL, createdAt: NOW, isTitleManual: true, kind: 'topic',
    nodeId: 'source', parentNodeId: null, position: 0, reveal: null, title: 'Source', updatedAt: NOW });
  const from = ORIGINAL.indexOf('this sentence');
  upsertNodeSnapshot({
    anchorLink: { id: 'link', kind: 'highlight', locator: { from, originalText: 'this sentence', to: from + 13 } },
    content: 'this sentence', createdAt: NOW, isTitleManual: true, kind: 'topic', nodeId: 'highlight',
    parentNodeId: 'source', position: 0, reveal: null, title: 'Highlight', updatedAt: NOW
  });
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(mockedAppDataDir, { recursive: true, force: true });
});

function save(content: string, expectedContent = ORIGINAL) {
  return partitionEditedBody({ disposition: 'partition-body', sourceNodeId: 'source', expectedContent, content });
}

function body(nodeId = 'source') {
  return loadNodeBodyResolution(openDatabaseConnection().driver, nodeId)!.content;
}

function highlightedText(content: string) {
  const row = openDatabaseConnection().driver.queryOne<{ parent_id: string; anchor_link: string }>(
    "SELECT parent_id, anchor_link FROM nodes WHERE id = 'highlight'")!;
  const { locator } = JSON.parse(row.anchor_link) as { locator: { from: number; to: number } };
  return { parentId: row.parent_id, text: content.slice(locator.from, locator.to) };
}

it('saves a pasted oversized image as an attachment without splitting the topic', async () => {
  const result = save(`Intro.\n\n${IMAGE}\n\nKeep this sentence marked.`);
  const [attachment] = listNodeAttachments('source');

  expect(readBodyPartIds(openDatabaseConnection().driver, 'source')).toEqual([]);
  expect(body()).toBe(`Intro.\n\n![Big](asset://${attachment!.attachmentId}.png)\n\nKeep this sentence marked.`);
  expect(await fs.readFile(resolveAttachmentStoragePath(attachment!.attachmentId, undefined, 'image/png'))).toEqual(BIG_PNG);
  expect(highlightedText(body())).toEqual({ parentId: 'source', text: 'this sentence' });
  expect(result.activeNodeId).toBe('source');
  expect(result.createdNodeIds).toEqual([]);
  expect(result.deletedNodeIds).toBeUndefined();
  expect(result.nodes.find((node) => node.nodeId === 'source')?.content).toBe(body());
});

it('splits the converted text when it is still too long, keeping the image whole in one part', () => {
  const tail = 'y'.repeat(TEXT_BODY_MAX_BYTES);
  const result = save(`${ORIGINAL}\n\n${IMAGE}\n\n${tail}`);
  const { driver } = openDatabaseConnection();
  const parts = readBodyPartIds(driver, 'source');
  const [attachment] = listNodeAttachments(parts[0]!);
  const asset = `![Big](asset://${attachment!.attachmentId}.png)`;

  expect(result.createdNodeIds).toEqual(parts);
  expect(parts.length).toBeGreaterThan(1);
  expect(readPartitionedNodeBody(driver, 'source')).toBe(`${ORIGINAL}\n\n${asset}\n\n${tail}`);
  for (const id of parts) {
    expect(utf8ByteLength(body(id))).toBeLessThanOrEqual(TEXT_BODY_MAX_BYTES);
    expect(listNodeAttachments(id)).toHaveLength(1);
  }
  expect(parts.filter((id) => body(id).includes(asset))).toHaveLength(1);
  const highlight = highlightedText(body(parts[0]));
  expect(highlight).toEqual({ parentId: parts[0], text: 'this sentence' });
});

it('replaces an oversized image that cannot be converted with the placeholder line', () => {
  save(`${ORIGINAL}\n\n![Broken](data:image/png;base64,${'A'.repeat(TEXT_BODY_MAX_BYTES)})\n\nAfter.`);

  expect(readBodyPartIds(openDatabaseConnection().driver, 'source')).toEqual([]);
  expect(body()).toBe(`${ORIGINAL}\n\n${UNIMPORTABLE_IMAGE_PLACEHOLDER}\n\nAfter.`);
  expect(listNodeAttachments('source')).toEqual([]);
});

it('leaves the existing parts alone when a converted edit of the original fits', () => {
  save(`${ORIGINAL}\n\n${'y'.repeat(TEXT_BODY_MAX_BYTES)}`);
  const { driver } = openDatabaseConnection();
  const parts = readBodyPartIds(driver, 'source');
  const before = parts.map((id) => body(id));

  const result = save(`Cover.\n\n${IMAGE}`, '');

  expect(body()).toMatch(/^Cover\.\n\n!\[Big\]\(asset:\/\/[a-f0-9]{64}\.png\)$/);
  expect(readBodyPartIds(driver, 'source')).toEqual(parts);
  expect(parts.map((id) => body(id))).toEqual(before);
  expect(result.deletedNodeIds).toBeUndefined();
});
