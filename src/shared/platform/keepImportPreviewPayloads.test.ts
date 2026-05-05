import { describe, expect, it } from 'vitest';

import { toRuntimeKeepImportPreviewResult } from './keepImportPreviewPayloads';

describe('keepImportPreviewPayloads', () => {
  it('normalizes keep import preview content previews from the runtime payload', () => {
    expect(
      toRuntimeKeepImportPreviewResult({
        blocked_count: 0,
        discovered_count: 1,
        entries: [
          {
            content_preview: 'Before important after',
            detail: 'New file will be imported when enabled.',
            detected_highlight_count: 1,
            highlight_samples: [
              {
                excerpt: 'Before important after',
                highlightText: 'important',
                matched: true,
                sourceName: 'entry.md'
              }
            ],
            source_path: 'entry.md',
            status: 'new'
          }
        ],
        failed_count: 0,
        new_count: 1,
        previewed_at: '2026-04-14T00:00:00.000Z',
        root_path: '/tmp/source',
        unchanged_count: 0,
        updated_count: 0
      })
    ).toEqual({
      blockedCount: 0,
      discoveredCount: 1,
      entries: [
        {
          contentPreview: 'Before important after',
          detail: 'New file will be imported when enabled.',
          detectedHighlightCount: 1,
          highlightSamples: [
            {
              excerpt: 'Before important after',
              highlightText: 'important',
              matched: true,
              sourceName: 'entry.md'
            }
          ],
          sourcePath: 'entry.md',
          status: 'new'
        }
      ],
      failedCount: 0,
      newCount: 1,
      previewedAt: '2026-04-14T00:00:00.000Z',
      rootPath: '/tmp/source',
      unchangedCount: 0,
      updatedCount: 0
    });
  });
});
