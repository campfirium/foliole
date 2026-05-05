import { describe, expect, it } from 'vitest';

import { resolveNodeTreeRowIconState } from './NodeTreeRowIconModel';

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
