import { describe, expect, it } from 'vitest';

import { resolveNodeTreeRowIconKind, resolveNodeTreeRowIconState } from './NodeTreeRowIconModel';

describe('resolveNodeTreeRowIconKind', () => {
  it('returns a closed folder icon for collapsed folders', () => {
    expect(
      resolveNodeTreeRowIconKind({
        hasChildren: true,
        isCollapsed: true,
        isReviewCard: false,
        kind: 'folder'
      })
    ).toBe('folder-closed');
  });

  it('returns an open folder icon for expanded folders', () => {
    expect(
      resolveNodeTreeRowIconKind({
        hasChildren: true,
        isCollapsed: false,
        isReviewCard: false,
        kind: 'folder'
      })
    ).toBe('folder-open');
  });

  it('keeps topics on the non-folder icon path', () => {
    expect(
      resolveNodeTreeRowIconKind({
        hasChildren: true,
        isCollapsed: false,
        isReviewCard: false,
        kind: 'topic'
      })
    ).toBe('reading');
  });
});

describe('resolveNodeTreeRowIconState', () => {
  it('returns dismissed when the reading state is dismissed', () => {
    expect(resolveNodeTreeRowIconState({ hasEnteredSchedule: true, isDismissed: true })).toBe(
      'dismissed'
    );
  });

  it('returns pending before the node enters the schedule', () => {
    expect(resolveNodeTreeRowIconState({ hasEnteredSchedule: false, isDismissed: false })).toBe(
      'pending'
    );
  });

  it('returns scheduled after the node enters the schedule', () => {
    expect(resolveNodeTreeRowIconState({ hasEnteredSchedule: true, isDismissed: false })).toBe(
      'scheduled'
    );
  });
});
