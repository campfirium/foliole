import { promises as fs } from 'node:fs';
import path from 'node:path';

import { openDatabaseConnection } from '../database/connection.js';

import { saveImportManagerSettings } from './importManagerSettings.js';

export async function seedReadwiseArticleFixture(root: string) {
  const fullDocumentDir = path.join(root, 'readwise', 'Full Document Contents', 'Articles');
  const highlightDir = path.join(root, 'readwise', 'Articles');
  await fs.mkdir(fullDocumentDir, { recursive: true });
  await fs.mkdir(highlightDir, { recursive: true });
  await fs.writeFile(
    path.join(fullDocumentDir, 'Sample Article.md'),
    [
      '## Metadata',
      '- Author: Someone',
      '',
      '## Full Document',
      'Before the quote. This is the highlighted sentence. After the quote.',
      '',
      'Another paragraph with Another matching excerpt. End.'
    ].join('\n'),
    'utf8'
  );
  await fs.writeFile(
    path.join(highlightDir, 'Sample Article.md'),
    [
      '# Sample Article',
      '',
      '## Highlights',
      'This is the highlighted sentence. [...] (https://example.com)',
      '',
      'Another matching excerpt.',
      'Note: Keep import note',
      'Tags: [[tag-a]] [[tag-b]]'
    ].join('\n'),
    'utf8'
  );
  return { fullDocumentDir, highlightDir, readwiseRoot: path.join(root, 'readwise') };
}

export function saveReadwiseKeepImportSettings(paths: {
  fullDocumentDir: string;
  highlightDir: string;
  readwiseRoot: string;
}) {
  saveImportManagerSettings({
    readwiseReaderConfig: {
      highlightSeparator: '\\n\\n',
      highlightsHeading: '## Highlights',
      importScope: 'highlights_only',
      newHighlightsHeading: '## New highlights added',
      noteKeyword: 'Note:',
      tagKeyword: 'Tags:',
      validatedAt: '2026-03-26T01:00:00.000Z'
    },
    readwiseRootPath: paths.readwiseRoot,
    readwiseSources: [
      {
        highlightMode: 'split',
        highlightPath: paths.highlightDir,
        id: 'draft-import-source-1',
        keepPreview: null,
        keepState: 'enabled',
        kind: 'articles',
        primaryPath: paths.fullDocumentDir
      }
    ]
  });
}

export function saveReadwiseKeepImportSettingsWithScope(
  paths: {
    fullDocumentDir: string;
    highlightDir: string;
    readwiseRoot: string;
  },
  importScope: 'all' | 'highlights_only'
) {
  saveImportManagerSettings({
    readwiseReaderConfig: {
      highlightSeparator: '\\n\\n',
      highlightsHeading: '## Highlights',
      importScope,
      newHighlightsHeading: '## New highlights added',
      noteKeyword: 'Note:',
      tagKeyword: 'Tags:',
      validatedAt: '2026-03-26T01:00:00.000Z'
    },
    readwiseRootPath: paths.readwiseRoot,
    readwiseSources: [
      {
        highlightMode: 'split',
        highlightPath: paths.highlightDir,
        id: 'draft-import-source-1',
        keepPreview: null,
        keepState: 'enabled',
        kind: 'articles',
        primaryPath: paths.fullDocumentDir
      }
    ]
  });
}

export function readImportedChildRows() {
  const connection = openDatabaseConnection();
  const importedNode = connection.sqlite
    .prepare(`SELECT latest_node_id FROM import_sources WHERE source_name = 'Sample Article.md'`)
    .get() as { latest_node_id: string };
  const parentRow = connection.sqlite
    .prepare('SELECT content FROM nodes WHERE id = ?')
    .get(importedNode.latest_node_id) as { content: string };
  const childRows = connection.sqlite
    .prepare('SELECT title, content, anchor_link FROM nodes WHERE parent_id = ? ORDER BY created_at ASC')
    .all(importedNode.latest_node_id) as Array<{ anchor_link: string | null; content: string; title: string }>;
  return { childRows, parentRow };
}

export function readImportedReadwiseSourceRow() {
  const connection = openDatabaseConnection();
  return connection.sqlite
    .prepare(
      `SELECT source_fingerprint, source_locator, source_name, latest_node_id, last_content_fingerprint
       FROM import_sources
       WHERE source_name = 'Sample Article.md'`
    )
    .get() as {
      last_content_fingerprint: string;
      latest_node_id: string;
      source_fingerprint: string;
      source_locator: string;
      source_name: string;
    };
}
