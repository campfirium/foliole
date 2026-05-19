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
