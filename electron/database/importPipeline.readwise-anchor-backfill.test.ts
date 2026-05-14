// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-import-pipeline-readwise-anchor-backfill-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import type { PreparedImportRecord } from '../../lib/core/import/contract.js';
import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { runPreparedImport } from './importPipeline.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-anchor-backfill-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function createReadwiseImport(importedAt: string) {
  return createPreparedDesktopTextImport({
    content: ['# Article', '', '1. Alpha step.', '', '2. Beta step.'].join('\n'),
    fileName: 'readwise.md',
    filePath: '/tmp/readwise.md',
    highlightSidecar: [{ text: ['1. Alpha step.', '  2. Beta step.'].join('\n') }],
    importedAt,
    kind: 'markdown',
    sourceProfile: 'body_with_highlight_sidecar'
  });
}

function simulateLegacyUnmatchedImport(prepared: PreparedImportRecord): PreparedImportRecord {
  return {
    ...prepared,
    degradedReason: 'Controlled context degraded: no sidecar highlights matched source body',
    matchedHighlights: [],
    unmatchedHighlights: (prepared.matchedHighlights ?? []).map((highlight) => ({
      content: highlight.content,
      label: highlight.label,
      locatorText: null
    }))
  };
}

function readChildRows(parentNodeId: string | null) {
  if (!parentNodeId) {
    return [];
  }
  return openDatabaseConnection().sqlite
    .prepare('SELECT content, anchor_link FROM nodes WHERE parent_id = ? ORDER BY created_at ASC')
    .all(parentNodeId) as Array<{ anchor_link: string | null; content: string }>;
}

it('backfills an existing readwise highlight child when a duplicate import can now anchor it', () => {
  const prepared = createReadwiseImport('2026-05-13T10:00:00.000Z');
  const first = runPreparedImport(simulateLegacyUnmatchedImport(prepared));
  expect(readChildRows(first.nodeId)).toEqual([
    {
      anchor_link: null,
      content: ['1. Alpha step.', '  2. Beta step.'].join('\n')
    }
  ]);

  const duplicate = runPreparedImport({
    ...prepared,
    importedAt: '2026-05-13T10:05:00.000Z'
  });
  const childRows = readChildRows(duplicate.nodeId);

  expect(duplicate.duplicateSemantic).toBe('duplicate');
  expect(childRows).toHaveLength(1);
  expect(JSON.parse(childRows[0]!.anchor_link ?? '{}')).toMatchObject({
    kind: 'highlight',
    locator: { originalText: '1. Alpha step.\n\n2. Beta step.' },
    origin: 'imported'
  });
});

it('anchors cleaned forum highlights back to the continuous source range', () => {
  const content = [
    '# 求助：百分是否有一键分屏功能',
    '',
    '|  |  |  |',
    '| --- | --- | --- |',
    '| *[中级会员](https://www.centbrowser.net/zh-cn/home.php?mod=spacecp&ac=usergroup&gid=12)* |  **[*8*#](https://www.centbrowser.net/zh-cn/forum.php?mod=redirect&goto=findpost&ptid=11755&pid=80148)** ',
    '',
    '|  |',
    '| --- |',
    "|  可以用小书签，我这只有横竖 2 分屏的。  新建一个书签，修改书签网址，把下面代码复制进去保存即可。 这两个小书签是在同一个窗口内进行分屏，点击后输入要分屏的网址，即可打开。空着不填会将当前网页复制为两个进行并排。  **垂直左右分屏**1. javascript:document.write('<HTML><FRAMESET COLS=50><FRAME SRC=left></FRAMESET></HTML>')",
    '',
    "*复制代码***水平上下分屏**1. javascript:document.write('<HTML><FRAMESET ROWS=50><FRAME SRC=top></FRAMESET></HTML>')",
    '',
    '*复制代码*   其实，你'
  ].join('\n');
  const highlight = [
    '横竖 2 分屏的。',
    '新建一个书签，修改书签网址，把下面代码复制进去保存即可。',
    '这两个小书签是在同一个窗口内进行分屏，点击后输入要分屏的网址，即可打开。空着不填会将当前网页复制为两个进行并排。',
    '**垂直左右分屏**',
    "1. javascript:document.write('<HTML><FRAMESET COLS=50><FRAME SRC=left></FRAMESET></HTML>')",
    '*复制代码*',
    '**水平上下分屏**',
    "1. javascript:document.write('<HTML><FRAMESET ROWS=50><FRAME SRC=top></FRAMESET></HTML>')",
    '*复制代码*'
  ].join('\n');
  const imported = runPreparedImport(
    createPreparedDesktopTextImport({
      content,
      fileName: 'forum.md',
      filePath: '/tmp/forum.md',
      highlightSidecar: [{ text: highlight }],
      importedAt: '2026-05-13T10:10:00.000Z',
      kind: 'markdown',
      sourceProfile: 'body_with_highlight_sidecar'
    })
  );
  const childRows = readChildRows(imported.nodeId);
  const anchor = JSON.parse(childRows[0]?.anchor_link ?? '{}') as { locator?: { from: number; originalText: string; to: number } };

  expect(anchor.locator?.originalText).toContain('横竖 2 分屏的。');
  expect(anchor.locator?.originalText).toContain('**水平上下分屏**');
  expect(anchor.locator ? content.slice(anchor.locator.from, anchor.locator.to) : null).toBe(anchor.locator?.originalText);
});
