import { describe, expect, it } from 'vitest';

import {
  createPersistedNodeViewState,
  resolveNodeViewStateRestoreTarget,
  shouldWritePersistedNodeViewState
} from '../../../lib/platform/persistedNodeViewState';

const baseState = {
  nodeId: 'node-1',
  scrollTop: 128,
  selectionFrom: null,
  selectionTo: null,
  updatedAt: '2026-04-30T08:00:00.000Z',
  source: 'user-scroll'
} as const;

describe('persistedNodeViewState', () => {
  it('keeps missing selection as nullable fields instead of fake zero selection', () => {
    expect(createPersistedNodeViewState(baseState)).toEqual(baseState);
  });

  it('resolves scroll-only restore targets without requiring selection', () => {
    expect(resolveNodeViewStateRestoreTarget(baseState)).toEqual({
      ...baseState,
      mode: 'scroll-only'
    });
  });

  it('resolves selection restore targets only when both selection endpoints exist', () => {
    const target = resolveNodeViewStateRestoreTarget({
      ...baseState,
      selectionFrom: 20,
      selectionTo: 28
    });

    expect(target?.mode).toBe('selection');
    expect(target?.selectionFrom).toBe(20);
    expect(target?.selectionTo).toBe(28);
  });

  it('normalizes invalid source values to user-scroll for old payloads', () => {
    expect(createPersistedNodeViewState({ ...baseState, source: undefined })?.source).toBe('user-scroll');
    expect(createPersistedNodeViewState({ ...baseState, source: 'legacy' })?.source).toBe('user-scroll');
  });

  it('prevents restore writes from overwriting saved user reading positions', () => {
    expect(
      shouldWritePersistedNodeViewState(baseState, {
        ...baseState,
        scrollTop: 12,
        updatedAt: '2026-04-30T09:00:00.000Z',
        source: 'restore'
      })
    ).toEqual({ shouldWrite: false, reason: 'restore-cannot-cover-user-position' });
  });

  it('allows newer user scroll writes after restore state', () => {
    expect(
      shouldWritePersistedNodeViewState(
        { ...baseState, source: 'restore' },
        { ...baseState, updatedAt: '2026-04-30T09:00:00.000Z', source: 'user-scroll' }
      )
    ).toEqual({ shouldWrite: true, reason: 'newer-or-equal' });
  });

  it('keeps newer rows when an older write arrives', () => {
    expect(
      shouldWritePersistedNodeViewState(
        { ...baseState, updatedAt: '2026-04-30T09:00:00.000Z' },
        { ...baseState, updatedAt: '2026-04-30T08:00:00.000Z', source: 'close-flush' }
      )
    ).toEqual({ shouldWrite: false, reason: 'older' });
  });

  it('prefers explicit user position writes over restore or sync ties', () => {
    expect(
      shouldWritePersistedNodeViewState(
        { ...baseState, source: 'sync-apply' },
        { ...baseState, source: 'close-flush' }
      )
    ).toEqual({ shouldWrite: true, reason: 'local-user-tie' });
  });
});
