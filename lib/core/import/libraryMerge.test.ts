import { describe, expect, it } from 'vitest';

import { decideLibraryMergeNode } from './libraryMerge.js';

const target = { node_id: 'n', deleted_at: null, content: 'mine', tombstoned: 0, known: 0 };

describe('decideLibraryMergeNode', () => {
  it('adds a node this library never had and skips one it deleted for good', () => {
    expect(decideLibraryMergeNode({ content: 'x' }, { ...target, node_id: null })).toBe('new');
    expect(decideLibraryMergeNode({ content: 'x' }, { ...target, node_id: null, tombstoned: 1 })).toBe('deleted');
  });

  it('never revives a node in Trash or a tombstoned one', () => {
    expect(decideLibraryMergeNode({ content: 'x' }, { ...target, deleted_at: '2026-01-01T00:00:00.000Z' })).toBe('deleted');
    expect(decideLibraryMergeNode({ content: 'x' }, { ...target, tombstoned: 1 })).toBe('deleted');
  });

  it('leaves the same body alone, skips a source version this library already has, otherwise offers an alternative', () => {
    expect(decideLibraryMergeNode({ content: 'mine' }, target)).toBe('same');
    expect(decideLibraryMergeNode({ content: 'older' }, { ...target, known: 1 })).toBe('known');
    expect(decideLibraryMergeNode({ content: 'theirs' }, target)).toBe('alternative');
  });
});
