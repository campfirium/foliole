// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-parent-content-mutation-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { applyParentContentChange } from '../../lib/core/database/parentContentMutation.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-parent-content-mutation-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function seedNode(input: {
  anchorLink?: Parameters<typeof upsertNodeSnapshot>[0]['anchorLink'];
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

function readNode(nodeId: string) {
  return openDatabaseConnection().sqlite
    .prepare('SELECT content, anchor_link, image_regions FROM nodes WHERE id = ?')
    .get(nodeId) as { anchor_link: string | null; content: string; image_regions: string | null };
}

it('updates parent content and remaps text child locators through image rewrites', () => {
  const previousContent = '![Cover](cover.png)\n\nTarget sentence.\n\n![Chart](chart.png)';
  seedNode({ content: previousContent, nodeId: 'node-parent', parentNodeId: null });
  seedNode({
    anchorLink: {
      id: 'anchor-1',
      kind: 'highlight',
      locator: {
        from: previousContent.indexOf('Target sentence.'),
        originalText: 'Target sentence.',
        to: previousContent.indexOf('Target sentence.') + 'Target sentence.'.length
      }
    },
    content: 'Target sentence.',
    nodeId: 'node-child',
    parentNodeId: 'node-parent'
  });

  const nextContent = '![Cover](asset://cover.png)\n\nTarget sentence.\n\n![Chart](asset://chart.png)';
  const result = applyParentContentChange({
    driver: openDatabaseConnection().driver,
    nextContent,
    nodeId: 'node-parent',
    previousContent,
    updatedAt: '2026-05-13T00:00:01.000Z'
  });
  const childAnchor = JSON.parse(readNode('node-child').anchor_link ?? '{}') as {
    locator: { from: number; originalText: string; to: number };
  };

  expect(result).toMatchObject({
    affectedChildIds: ['node-child'],
    finalContent: nextContent,
    skippedAnchors: [],
    unmappedAnchorIds: [],
    written: true
  });
  expect(readNode('node-parent').content).toBe(nextContent);
  expect(nextContent.slice(childAnchor.locator.from, childAnchor.locator.to)).toBe('Target sentence.');
});

it('expands remapped image locators to the full localized image markdown', () => {
  const remoteImage = '![](https://cdn.example.com/cover.jpg)';
  const previousContent = `Lead ${remoteImage}`;
  seedNode({ content: previousContent, nodeId: 'node-parent', parentNodeId: null });
  seedNode({
    anchorLink: {
      id: 'anchor-image',
      kind: 'highlight',
      locator: {
        from: previousContent.indexOf(remoteImage),
        originalText: remoteImage,
        to: previousContent.indexOf(remoteImage) + remoteImage.length
      }
    },
    content: remoteImage,
    nodeId: 'node-child',
    parentNodeId: 'node-parent'
  });

  const localImage = '![](asset://7aeed822aea5916460d95e2220aeeeacaf3f31244115095762db670b23cb3fec.jpg)';
  const nextContent = `Lead\n\n${localImage}`;
  applyParentContentChange({
    driver: openDatabaseConnection().driver,
    nextContent,
    nodeId: 'node-parent',
    previousContent,
    updatedAt: '2026-05-13T00:00:01.000Z'
  });
  const child = readNode('node-child');
  const childAnchor = JSON.parse(child.anchor_link ?? '{}') as {
    locator: { from: number; originalText: string; to: number };
  };

  expect(childAnchor.locator.originalText).toBe(localImage);
  expect(nextContent.slice(childAnchor.locator.from, childAnchor.locator.to)).toBe(localImage);
  expect(child.image_regions).toContain('7aeed822aea5916460d95e2220aeeeacaf3f31244115095762db670b23cb3fec');
});
