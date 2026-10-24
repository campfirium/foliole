// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'), app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir, app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { parseStoredAnchorLink } from '../../lib/core/database/anchorLinkCodec.js';
import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { ensureReadwiseSourceModeInitialized } from '../database/readwiseSourceMode.js';

import { commitReadwiseApiDocument } from './readwiseApiDocumentCommit.js';

const HIGHLIGHT_COUNT = 800;
const MAX_MAIN_THREAD_BLOCK_MS = 300;
const WORDS = 'river lantern copper meadow orbit velvet harbor quartz ember willow signal canyon mosaic thistle beacon falcon'
  .split(' ');

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-commit-blocking-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
  ensureReadwiseSourceModeInitialized();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function passage(index: number) {
  const words = Array.from({ length: 20 }, (_, offset) => WORDS[(index * 7 + offset * 3 + offset * offset) % WORDS.length]);
  return `${words.join(' ')} passage ${index + 1}.`;
}

function largeArticle(highlightText: (text: string) => string): PreparedReadwiseApiDocument {
  const passages = Array.from({ length: HIGHLIGHT_COUNT }, (_, index) => passage(index));
  return {
    annotations: passages.map((text, index) => ({
      content: highlightText(text), contentHash: `hash-${index}`, kind: 'highlight' as const, locatorText: highlightText(text),
      parentRemoteId: null, remoteId: `highlight-${index}`, updatedAt: '2026-10-20T00:00:00.000Z'
    })),
    body: passages.map((text) => `<p>${text} Surrounding prose follows.</p>`).join('\n'),
    category: 'article', coverImageUrl: null, degradedReason: null, id: 'large-article',
    metadata: {
      author: 'Reader', category: 'article', readerUrl: 'https://readwise.io/reader/read/large-article',
      sourceUrl: 'https://example.com/large', title: 'Large article'
    },
    title: 'Large article', unmatchedAnnotationCount: 0, updatedAt: '2026-10-20T00:00:00.000Z'
  };
}

async function measureLongestBlock(run: () => Promise<unknown>) {
  let last = performance.now();
  let longest = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    longest = Math.max(longest, now - last);
    last = now;
  }, 5);
  const result = await run();
  clearInterval(timer);
  return { longest: Math.max(longest, performance.now() - last), result };
}

it.each([
  ['matching the body text exactly', (text: string) => text],
  ['wrapped differently from the body', (text: string) => text.replace(/ /g, '\n')]
])('imports a Readwise API article with 800 highlights %s without holding the main thread', async (_, highlightText) => {
  const { longest, result } = await measureLongestBlock(() => commitReadwiseApiDocument({
    config: createDefaultReadwiseReaderConfig(),
    connectionRef: 'connection', destination: 'inbox', document: largeArticle(highlightText)
  }));
  expect(result).toMatchObject({ status: 'imported' });
  const driver = openDatabaseConnection().driver;
  const topic = driver.queryOne<{ latest_node_id: string }>(
    "SELECT latest_node_id FROM import_sources WHERE remote_document_id = 'large-article'");
  if (!topic) throw new Error('import_source_missing');
  const children = driver.queryAll<{ id: string; anchor_link: string | null; content: string }>(
    'SELECT id, anchor_link, content FROM nodes WHERE parent_id = ? AND deleted_at IS NULL', [topic.latest_node_id]);
  expect(children).toHaveLength(HIGHLIGHT_COUNT);
  const parentBody = loadNodeBodyResolution(driver, topic.latest_node_id)?.content;
  expect(parentBody).toBeDefined();
  for (const child of children) {
    const locator = parseStoredAnchorLink(child.anchor_link)?.locator;
    if (!locator || !('from' in locator) || !('to' in locator) || !('originalText' in locator)
      || typeof locator.from !== 'number' || typeof locator.to !== 'number') {
      throw new Error(`Imported highlight ${child.id} has no text locator`);
    }
    expect(parentBody?.slice(locator.from, locator.to)).toBe(locator.originalText);
    expect(locator.originalText).toBe(child.content.replace(/\s+/g, ' '));
  }
  const order = driver.queryOne<{ child_ids_json: string }>(
    'SELECT child_ids_json FROM parent_child_order WHERE parent_id = ?', [topic.latest_node_id]);
  const byId = new Map(children.map((child) => [child.id, child.content]));
  const ordered = (JSON.parse(order?.child_ids_json ?? '[]') as string[]).map((id) => byId.get(id));
  expect(ordered).toEqual(Array.from({ length: HIGHLIGHT_COUNT }, (_, index) => highlightText(passage(index))));
  expect(longest, `Readwise import blocked the main thread for ${longest.toFixed(1)} ms`).toBeLessThan(MAX_MAIN_THREAD_BLOCK_MS);
}, 120_000);
