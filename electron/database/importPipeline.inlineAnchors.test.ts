// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-import-pipeline-inline-anchors-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';

import { closeDatabaseConnection } from './connection.js';
import { insertManualChildHighlight, mapInlineAnchorRows } from './importPipeline.inlineAnchors.test-support.js';
import { runPreparedImport } from './importPipeline.js';
import { readPersistedImportState } from './importPipeline.test-support.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-pipeline-inline-anchors-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function createPreparedInlineAnchorImport(args: {
  content: string;
  importedAt: string;
  sourcePath?: string;
}) {
  return createPreparedDesktopTextImport({
    content: args.content,
    degradedReason: null,
    fileName: 'imported-inline-anchors.md',
    filePath: args.sourcePath ?? '/tmp/imported-inline-anchors.md',
    importedAt: args.importedAt,
    kind: 'markdown'
  });
}

function expectUpdatedInlineAnchorImportState(args: {
  childRows: Array<{ anchor_link: string | null; content: string; parent_id: string | null; title: string }>;
  cleanContent: string;
  nodeId: string | null;
  nodeRow: unknown;
}) {
  expect(args.nodeRow).toEqual({
    content: args.cleanContent,
    hide_title_heading: 1,
    opening_text: 'Use critical and secret text',
    parent_id: 'special-inbox',
    title: 'imported-inline-anchors'
  });
  expect(args.childRows).toHaveLength(2);
  expect(args.childRows.map((row) => ({
    ...mapInlineAnchorRows([row])[0],
    parent_id: row.parent_id
  }))).toEqual([
    {
      anchorLink: {
        id: 'h2',
        kind: 'highlight',
        origin: 'imported',
        locator: {
          from: args.cleanContent.indexOf('critical'),
          originalText: 'critical',
          to: args.cleanContent.indexOf('critical') + 'critical'.length
        }
      },
      content: 'critical',
      parent_id: args.nodeId,
      title: 'critical'
    },
    {
      anchorLink: {
        id: 'c2',
        kind: 'cloze',
        origin: 'imported',
        locator: {
          from: args.cleanContent.indexOf('secret'),
          originalText: 'secret',
          to: args.cleanContent.indexOf('secret') + 'secret'.length
        }
      },
      content: '# Imported\nUse critical and [...] text',
      parent_id: args.nodeId,
      title: 'Imported'
    }
  ]);
}

it('imports inline highlight and cloze tags as pure markdown plus derived anchor nodes', () => {
  const imported = runPreparedImport(
    createPreparedDesktopTextImport({
      content: '# Imported\nUse <highlight id="h1">important</highlight id="h1"> and <cloze id="c1">hidden</cloze id="c1"> text',
      degradedReason: null,
      fileName: 'imported-inline-anchors.md',
      filePath: '/tmp/imported-inline-anchors.md',
      importedAt: '2026-03-22T10:26:00.000Z',
      kind: 'markdown'
    })
  );

  const cleanContent = '# Imported\nUse important and hidden text';
  const { childRows, nodeRow } = readPersistedImportState(imported.sourceFingerprint, imported.nodeId);

  expect(nodeRow).toEqual({
    content: cleanContent,
    hide_title_heading: 1,
    opening_text: 'Use important and hidden text',
    parent_id: 'special-inbox',
    title: 'imported-inline-anchors'
  });
  expect(childRows.map((row) => ({
    ...mapInlineAnchorRows([row])[0],
    parent_id: row.parent_id
  }))).toEqual([
    {
      anchorLink: {
        id: 'h1',
        kind: 'highlight',
        origin: 'imported',
        locator: {
          from: cleanContent.indexOf('important'),
          originalText: 'important',
          to: cleanContent.indexOf('important') + 'important'.length
        }
      },
      content: 'important',
      parent_id: imported.nodeId,
      title: 'important'
    },
    {
      anchorLink: {
        id: 'c1',
        kind: 'cloze',
        origin: 'imported',
        locator: {
          from: cleanContent.indexOf('hidden'),
          originalText: 'hidden',
          to: cleanContent.indexOf('hidden') + 'hidden'.length
        }
      },
      content: '# Imported\nUse important and [...] text',
      parent_id: imported.nodeId,
      title: 'Imported'
    }
  ]);
});

function runReplacePreviouslyImportedInlineAnchorChildrenCase() {
  const sourcePath = '/tmp/imported-inline-anchors.md';
  const firstImported = runPreparedImport(createPreparedInlineAnchorImport({
    content: '# Imported\nUse <highlight id="h1">important</highlight id="h1"> and <cloze id="c1">hidden</cloze id="c1"> text',
    importedAt: '2026-03-22T10:26:00.000Z',
    sourcePath
  }));
  const updatedImported = runPreparedImport(createPreparedInlineAnchorImport({
    content: '# Imported\nUse <highlight id="h2">critical</highlight id="h2"> and <cloze id="c2">secret</cloze id="c2"> text',
    importedAt: '2026-03-22T10:27:00.000Z',
    sourcePath
  }));

  const cleanContent = '# Imported\nUse critical and secret text';
  const { childRows, nodeRow } = readPersistedImportState(updatedImported.sourceFingerprint, updatedImported.nodeId);

  expect(updatedImported.nodeId).toBe(firstImported.nodeId);
  expectUpdatedInlineAnchorImportState({
    childRows,
    cleanContent,
    nodeId: updatedImported.nodeId,
    nodeRow
  });
}

it('replaces previously imported tagged children when the same source is imported again', runReplacePreviouslyImportedInlineAnchorChildrenCase);

function runKeepManualChildHighlightCase() {
  const sourcePath = '/tmp/imported-inline-anchors.md';
  const firstImported = runPreparedImport(createPreparedInlineAnchorImport({
    content: '# Imported\nUse <highlight id="h1">important</highlight id="h1"> and <cloze id="c1">hidden</cloze id="c1"> text',
    importedAt: '2026-03-22T10:26:00.000Z',
    sourcePath
  }));
  insertManualChildHighlight(firstImported.nodeId);

  const updatedImported = runPreparedImport(createPreparedInlineAnchorImport({
    content: '# Imported\nUse <highlight id="h2">critical</highlight id="h2"> and <cloze id="c2">secret</cloze id="c2"> text',
    importedAt: '2026-03-22T10:27:00.000Z',
    sourcePath
  }));

  const { childRows } = readPersistedImportState(updatedImported.sourceFingerprint, updatedImported.nodeId);

  expect(mapInlineAnchorRows(childRows)).toEqual([
    {
      anchorLink: {
        id: 'manual-hl-1',
        kind: 'highlight',
        locator: {
          from: 0,
          originalText: 'manual text',
          to: 'manual text'.length
        }
      },
      content: 'manual text',
      title: 'Manual note'
    },
    {
      anchorLink: {
        id: 'h2',
        kind: 'highlight',
        origin: 'imported',
        locator: {
          from: '# Imported\nUse critical and secret text'.indexOf('critical'),
          originalText: 'critical',
          to: '# Imported\nUse critical and secret text'.indexOf('critical') + 'critical'.length
        }
      },
      content: 'critical',
      title: 'critical'
    },
    {
      anchorLink: {
        id: 'c2',
        kind: 'cloze',
        origin: 'imported',
        locator: {
          from: '# Imported\nUse critical and secret text'.indexOf('secret'),
          originalText: 'secret',
          to: '# Imported\nUse critical and secret text'.indexOf('secret') + 'secret'.length
        }
      },
      content: '# Imported\nUse critical and [...] text',
      title: 'Imported'
    }
  ]);
}

it('keeps manually created child highlights when replacing imported tagged children', runKeepManualChildHighlightCase);
