import { Chunk } from '@codemirror/merge';
import { describe, expect, it, vi } from 'vitest';

import {
  createSourceUpdateDiffSnapshot,
  updateSourceUpdateDiffSnapshot
} from './sourceUpdateDiffEngine';

describe('sourceUpdateDiffEngine', () => {
  it('updates only the edited side through CodeMirror incremental chunks', () => {
    const updateA = vi.spyOn(Chunk, 'updateA');
    const updateB = vi.spyOn(Chunk, 'updateB');
    let snapshot = createSourceUpdateDiffSnapshot('Alpha\nShared', 'Beta\nShared');

    snapshot = updateSourceUpdateDiffSnapshot(snapshot, 'Alpha revised\nShared', 'Beta\nShared');
    expect(snapshot.currentDoc.toString()).toBe('Alpha revised\nShared');
    expect(updateA).toHaveBeenCalledTimes(1);
    expect(updateB).not.toHaveBeenCalled();

    snapshot = updateSourceUpdateDiffSnapshot(snapshot, 'Alpha revised\nShared', 'Beta revised\nShared');
    expect(snapshot.updatedDoc.toString()).toBe('Beta revised\nShared');
    expect(updateA).toHaveBeenCalledTimes(1);
    expect(updateB).toHaveBeenCalledTimes(1);
  });

  it('keeps long unrelated drafts inside the bounded official diff path', () => {
    const current = Array.from({ length: 1_000 }, (_, index) => `Current paragraph ${index}.`).join('\n');
    const updated = Array.from({ length: 1_000 }, (_, index) => `Updated paragraph ${index}.`).join('\n');

    const snapshot = createSourceUpdateDiffSnapshot(current, updated);

    expect(snapshot.currentDoc.lines).toBe(1_000);
    expect(snapshot.updatedDoc.lines).toBe(1_000);
    expect(snapshot.chunks.length).toBeGreaterThan(0);
  });
});
