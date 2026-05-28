// @vitest-environment node

import { expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn()
  }
}));

import { parseSourceDispositionText, renderSourceDispositionText } from './sourceDispositionFiles.js';

it('round-trips readable source topic handling text', () => {
  const text = renderSourceDispositionText([
    {
      disposition: 'dismissed',
      originalTitle: 'A watched topic',
      sourceKind: 'keep',
      sourceScope: 'rule:Articles',
      updatedAt: '2026-05-28T00:00:00.000Z'
    },
    {
      disposition: 'soft_deleted',
      originalTitle: 'A Readwise topic',
      sourceKind: 'readwise',
      sourceScope: 'readwise:Articles',
      updatedAt: '2026-05-28T01:00:00.000Z'
    }
  ], '2026-05-28T02:00:00.000Z');

  expect(text).toContain('"schema": "foliole.savedSourceTopicHandling"');
  expect(text).toContain('"dismissed"');
  expect(text).toContain('"watched_folder"');
  expect(text).toContain('"A watched topic"');
  expect(text).not.toContain('"source"');
  expect(text).not.toContain('"state"');
  expect(text).not.toContain('sourceScope');
  expect(text).not.toContain('updatedAt');
  expect(parseSourceDispositionText(text)).toEqual([
    {
      disposition: 'dismissed',
      originalTitle: 'A watched topic',
      sourceKind: 'keep',
    },
    {
      disposition: 'soft_deleted',
      originalTitle: 'A Readwise topic',
      sourceKind: 'readwise',
    }
  ]);
});

it('rejects text that is not a saved source topic handling export', () => {
  expect(parseSourceDispositionText('plain notes')).toBeNull();
  expect(parseSourceDispositionText('{"schema":"foliole.savedSourceTopicHandling","topics":{"dismissed":{"watched_folder":["Missing source"]}}}')).toBeNull();
});
