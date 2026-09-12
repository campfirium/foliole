// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-import-pipeline-readwise-chinese-variants-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';

import { closeDatabaseConnection } from './connection.js';
import { runPreparedImport } from './importPipeline.js';
import { parseAnchorLink, readPersistedImportState } from './importPipeline.test-support.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-pipeline-readwise-chinese-variants-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('anchors simplified Readwise highlights in a traditional Chinese source body', () => {
  const imported = runPreparedImport(
    createPreparedDesktopTextImport({
      content: [
        '# Article',
        '',
        '由記錄驅動，而非僅僅規劃：',
        '',
        '防彈筆記方法不是用「想像」來規劃或確定目標，而是強調在實際活動中記錄和反思。'
      ].join('\n'),
      fileName: 'readwise.md',
      filePath: '/tmp/readwise.md',
      highlightSidecar: [
        { text: '由记录驱动，而非仅仅规划：' },
        { text: '防弹笔记方法不是用「想像」来规划或确定目标' }
      ],
      importedAt: '2026-05-19T01:00:00.000Z',
      kind: 'markdown',
      sourceProfile: 'body_with_highlight_sidecar'
    })
  );

  const { childRows, nodeRow, runRows } = readPersistedImportState(imported.sourceFingerprint, imported.nodeId);
  const content = (nodeRow as { content: string }).content;
  const anchorLinks = childRows.map((row) => parseAnchorLink(row.anchor_link));

  expect(runRows).toEqual([
    {
      degraded_reason: null,
      duplicate_semantic: 'new',
      node_id: imported.nodeId,
      result_status: 'imported'
    }
  ]);
  expect(anchorLinks.map((anchor) => content.slice(anchor.locator?.from, anchor.locator?.to))).toEqual([
    '由記錄驅動，而非僅僅規劃：',
    '防彈筆記方法不是用「想像」來規劃或確定目標'
  ]);
});

it('anchors through unmapped Chinese variants and legacy empty-anchor artifacts', () => {
  const firstPrepared = createPreparedDesktopTextImport({
    content: '# Article\n\n沒有人為我們定義要創造的價值，我們必須自己去發現目標。',
    fileName: 'readwise.md', filePath: '/tmp/readwise.md',
    highlightSidecar: [{ text: '没有人为我们定义要创造的价值，我们必须自己去发现目标。' }],
    importedAt: '2026-09-12T00:00:00.000Z', kind: 'markdown',
    sourceProfile: 'body_with_highlight_sidecar'
  });
  firstPrepared.matchedHighlights = (firstPrepared.unmatchedHighlights ?? []).map((item) => ({
    ...item, locatorText: item.content
  }));
  firstPrepared.unmatchedHighlights = [];
  const imported = runPreparedImport(firstPrepared);
  const first = readPersistedImportState(imported.sourceFingerprint, imported.nodeId).childRows[0];
  expect(parseAnchorLink(first?.anchor_link ?? '').locator).toBeTruthy();

  const artifactPrepared = createPreparedDesktopTextImport({
    content: '# Article\n\n沒有人為我們定義要創造的價值，我們必須自己去發link現目標。',
    fileName: 'readwise-link.md', filePath: '/tmp/readwise-link.md',
    highlightSidecar: [{ text: '没有人为我们定义要创造的价值，我们必须自己去发现目标。' }],
    importedAt: '2026-09-12T00:01:00.000Z', kind: 'markdown',
    sourceProfile: 'body_with_highlight_sidecar'
  });
  artifactPrepared.matchedHighlights = (artifactPrepared.unmatchedHighlights ?? []).map((item) => ({
    ...item, locatorText: item.content
  }));
  artifactPrepared.unmatchedHighlights = [];
  const withArtifact = runPreparedImport(artifactPrepared);
  const second = readPersistedImportState(withArtifact.sourceFingerprint, withArtifact.nodeId).childRows[0];
  expect(parseAnchorLink(second?.anchor_link ?? '').locator).toBeTruthy();
});
