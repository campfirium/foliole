import { describe, expect, it } from 'vitest';

import { resolveOutlineActivePosition } from './WorkspaceGridContent';

describe('resolveOutlineActivePosition', () => {
  it('falls back to zero when persisted editor selection is null', () => {
    expect(resolveOutlineActivePosition({
      editorSelection: null,
      readingSelection: null
    })).toBe(0);
  });

  it('prefers live reading selection before persisted editor selection', () => {
    expect(resolveOutlineActivePosition({
      editorSelection: { from: 12 },
      readingSelection: { from: 24 }
    })).toBe(24);
  });
});
