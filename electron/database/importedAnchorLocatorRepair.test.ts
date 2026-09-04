// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-imported-anchor-repair-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { repairImportedAnchorLocators } from '../../lib/core/database/importedAnchorLocatorRepair.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-imported-anchor-repair-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function seedNode(input: {
  anchorLink?: Parameters<typeof upsertNodeSnapshot>[0]['anchorLink'] & { origin?: 'imported' };
  content: string;
  nodeId: string;
  parentNodeId: string | null;
}) {
  upsertNodeSnapshot({
    nodeId: input.nodeId,
    parentNodeId: input.parentNodeId,
    kind: 'topic',
    title: input.nodeId,
    isTitleManual: true,
    content: input.content,
    reveal: null,
    anchorLink: input.anchorLink ?? null,
    position: 0,
    createdAt: '2026-05-13T00:00:00.000Z',
    updatedAt: '2026-05-13T00:00:00.000Z'
  });
}

function readAnchorLink(nodeId: string) {
  return openDatabaseConnection().sqlite
    .prepare('SELECT anchor_link FROM nodes WHERE id = ?')
    .get(nodeId) as { anchor_link: string | null };
}

it('dry-runs by default and writes only when requested', () => {
  seedNode({ content: '![Cover](asset://cover.png)\n\nTarget sentence.', nodeId: 'node-parent', parentNodeId: null });
  seedNode({
    anchorLink: {
      id: 'anchor-1',
      kind: 'highlight',
      locator: { from: 0, originalText: 'Target sentence.', to: 'Target sentence.'.length },
      origin: 'imported'
    },
    content: 'Target sentence.',
    nodeId: 'node-child',
    parentNodeId: 'node-parent'
  });

  const dryRun = repairImportedAnchorLocators({
    driver: openDatabaseConnection().driver,
    repairedAt: '2026-05-13T00:00:01.000Z'
  });
  expect(dryRun).toMatchObject({ repairedNodeIds: ['node-child'], skipped: [], write: false });
  expect(JSON.parse(readAnchorLink('node-child').anchor_link ?? '{}').locator.from).toBe(0);

  const written = repairImportedAnchorLocators({
    driver: openDatabaseConnection().driver,
    repairedAt: '2026-05-13T00:00:02.000Z',
    write: true
  });
  const locator = JSON.parse(readAnchorLink('node-child').anchor_link ?? '{}').locator as {
    from: number;
    originalText: string;
    to: number;
  };
  expect(written).toMatchObject({ repairedNodeIds: ['node-child'], skipped: [], write: true });
  expect(locator).toEqual({
    from: '![Cover](asset://cover.png)\n\n'.length,
    originalText: 'Target sentence.',
    to: '![Cover](asset://cover.png)\n\nTarget sentence.'.length
  });
});

it('skips ambiguous imported locators', () => {
  seedNode({ content: 'Alpha Beta Beta', nodeId: 'node-parent', parentNodeId: null });
  seedNode({
    anchorLink: {
      id: 'anchor-1',
      kind: 'highlight',
      locator: { from: 0, originalText: 'Beta', to: 4 },
      origin: 'imported'
    },
    content: 'Beta',
    nodeId: 'node-child',
    parentNodeId: 'node-parent'
  });

  expect(
    repairImportedAnchorLocators({
      driver: openDatabaseConnection().driver,
      repairedAt: '2026-05-13T00:00:01.000Z',
      write: true
    })
  ).toMatchObject({
    repairedNodeIds: [],
    skipped: [{ nodeId: 'node-child', reason: 'ambiguous' }]
  });
});

it('repairs from Blob-only content and skips an unavailable parent', () => {
  seedNode({ content: 'Lead Target', nodeId: 'node-parent', parentNodeId: null });
  seedNode({
    anchorLink: {
      id: 'anchor-1', kind: 'highlight', locator: { from: 0, originalText: 'Target', to: 6 }, origin: 'imported'
    },
    content: 'Target', nodeId: 'node-child', parentNodeId: 'node-parent'
  });
  const connection = openDatabaseConnection();
  connection.driver.execute('UPDATE nodes SET content = ? WHERE id = ?', ['', 'node-parent']);
  expect(repairImportedAnchorLocators({
    driver: connection.driver, repairedAt: '2026-05-13T00:00:01.000Z', write: true
  }).repairedNodeIds).toEqual(['node-child']);

  const hash = connection.driver.queryOne<{ body_blob_hash: string }>(
    'SELECT body_blob_hash FROM nodes WHERE id = ?', ['node-parent']
  )?.body_blob_hash ?? '';
  connection.driver.execute('DELETE FROM content_blob_data WHERE hash = ?', [hash]);
  const before = readAnchorLink('node-child').anchor_link;
  expect(repairImportedAnchorLocators({
    driver: connection.driver, repairedAt: '2026-05-13T00:00:02.000Z', write: true
  }).skipped).toEqual([{ nodeId: 'node-child', reason: 'body_unavailable' }]);
  expect(readAnchorLink('node-child').anchor_link).toBe(before);
});
