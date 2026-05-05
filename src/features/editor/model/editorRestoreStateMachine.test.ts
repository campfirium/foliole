import { describe, expect, it } from 'vitest';

import type { PersistedNodeViewState } from '../../../../lib/platform/persistedNodeViewState';

import {
  canEditorRestoreTargetMatchDocument,
  createEditorRestoreTarget,
  createEditorRestoreTargetKey,
  isEditorRestoreOriginatedScroll,
  reduceEditorRestoreState,
  resolveEditorRestoreTarget,
  type EditorRestoreState
} from './editorRestoreStateMachine';

const baseState: PersistedNodeViewState = {
  nodeId: 'node-1',
  scrollTop: 1200,
  selectionFrom: 24,
  selectionTo: 48,
  updatedAt: '2026-04-30T01:00:00.000Z',
  source: 'user-scroll'
};

describe('editorRestoreStateMachine', () => {
  it('resolves scroll-only targets without fabricating a selection', () => {
    const target = resolveEditorRestoreTarget(
      { ...baseState, selectionFrom: null, selectionTo: null },
      { nodeId: 'node-1', valueLength: 10 }
    );

    expect(target).toEqual({
      ...baseState,
      selectionFrom: null,
      selectionTo: null,
      mode: 'scroll-only'
    });
  });

  it('creates stable target keys for selection and scroll-only restores', () => {
    const scrollOnlyTarget = createEditorRestoreTarget({
      nodeId: 'node-1',
      scrollTop: 5400,
      selectionFrom: null,
      selectionTo: null
    });
    const selectionTarget = createEditorRestoreTarget({
      nodeId: 'node-1',
      scrollTop: undefined,
      selectionFrom: 24,
      selectionTo: 24
    });

    expect(scrollOnlyTarget?.mode).toBe('scroll-only');
    expect(createEditorRestoreTargetKey(scrollOnlyTarget!)).toBe('node-1:scroll-only:5400:default');
    expect(createEditorRestoreTargetKey(selectionTarget!, 'center')).toBe('node-1:24:24:auto:center');
  });
});

describe('editorRestoreStateMachine document matching', () => {

  it('keeps selection restore pending until the document is long enough', () => {
    const state = createPendingState({ ...baseState, selectionFrom: 500, selectionTo: 540 });

    expect(
      reduceEditorRestoreState(state, {
        type: 'document-changed',
        document: { nodeId: 'node-1', valueLength: 120 }
      })
    ).toEqual(state);

    expect(
      reduceEditorRestoreState(state, {
        type: 'document-changed',
        document: { nodeId: 'node-1', valueLength: 600 }
      }).kind
    ).toBe('matched');
  });

  it('does not require a fake selection for scroll-only restore', () => {
    const state = createPendingState({ ...baseState, selectionFrom: null, selectionTo: null });

    expect(
      reduceEditorRestoreState(state, {
        type: 'document-changed',
        document: { nodeId: 'node-1', valueLength: 10 }
      }).kind
    ).toBe('matched');
  });

  it('keeps scroll-only restore pending while an empty document cannot scroll yet', () => {
    const target = resolveEditorRestoreTarget(
      { ...baseState, selectionFrom: null, selectionTo: null },
      { nodeId: 'node-1', valueLength: 0 }
    );

    expect(target).not.toBeNull();
    expect(canEditorRestoreTargetMatchDocument(target!, { nodeId: 'node-1', valueLength: 0 })).toBe(false);
    expect(canEditorRestoreTargetMatchDocument(target!, { nodeId: 'node-1', valueLength: 10 })).toBe(true);
  });
});

describe('editorRestoreStateMachine lifecycle', () => {

  it('marks restore-time scroll as restore originated until the restore settles', () => {
    const matched = reduceEditorRestoreState(createPendingState(baseState), {
      type: 'document-changed',
      document: { nodeId: 'node-1', valueLength: 100 }
    });
    const applied = reduceEditorRestoreState(matched, { type: 'restore-applied', appliedAt: 10 });
    const settled = reduceEditorRestoreState(applied, { type: 'restore-settled' });

    expect(isEditorRestoreOriginatedScroll(matched)).toBe(true);
    expect(isEditorRestoreOriginatedScroll(applied)).toBe(true);
    expect(isEditorRestoreOriginatedScroll(settled)).toBe(false);
  });

  it('invalidates a pending restore when the active node changes', () => {
    const state = reduceEditorRestoreState(createPendingState(baseState), {
      type: 'document-changed',
      document: { nodeId: 'node-2', valueLength: 100 }
    });

    expect(state).toMatchObject({ kind: 'invalidated', reason: 'node-changed' });
  });
});

function createPendingState(state: PersistedNodeViewState): EditorRestoreState {
  const target = resolveEditorRestoreTarget(state, { nodeId: state.nodeId, valueLength: 0 });
  expect(target).not.toBeNull();
  return { kind: 'pending', target: target! };
}
