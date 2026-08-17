import path from 'node:path';

export function createImportManagerSettingsTestInput(testSourceRoot: string) {
  return {
    detailsOpen: false,
    readwiseReaderConfig: {
      highlightsHeading: '## Highlights', highlightSeparator: '\\n\\n', importScope: 'highlights_only',
      newHighlightsHeading: '## New highlights added', noteKeyword: 'Note:', tagKeyword: 'Tags:',
      validatedAt: '2026-03-25T00:02:00.000Z'
    },
    readwiseRootPath: '/tmp/readwise-root',
    readwiseSources: [{
      id: 'draft-import-source-1', kind: 'articles',
      primaryPath: '/tmp/readwise-root/Full Document Contents/Articles',
      highlightPath: '/tmp/readwise-root/Articles', highlightMode: 'split',
      keepPreview: {
        blockedCount: 0, discoveredCount: 2, failedCount: 0, newCount: 1,
        previewedAt: '2026-03-25T00:03:00.000Z',
        samples: [{ detail: 'New file will be imported when enabled.', sourcePath: 'one.md', status: 'new' }],
        unchangedCount: 1, updatedCount: 0
      },
      keepState: 'previewed'
    }],
    titleStrategy: 'heading',
    sources: [
      {
        actionMode: 'keep', archivePath: '', id: 'draft-import-source-101',
        primaryPath: path.join(testSourceRoot, 'source-a'), highlightPath: path.join(testSourceRoot, 'highlight-a'),
        highlightMode: 'split', keepPreview: null, keepState: 'draft'
      },
      {
        actionMode: 'delete', archivePath: '', id: 'draft-import-source-105',
        primaryPath: path.join(testSourceRoot, 'source-b'), highlightPath: '', highlightMode: 'merged',
        keepPreview: null, keepState: 'enabled'
      }
    ]
  };
}
