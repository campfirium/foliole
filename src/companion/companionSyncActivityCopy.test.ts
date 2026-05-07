import { describe, expect, it } from 'vitest';

import { formatSyncResultMessage, isReportableSyncEvent } from './companionSyncActivityCopy';

describe('formatSyncResultMessage', () => {
  it('hides diagnostic timing for check-only completion', () => {
    expect(formatSyncResultMessage(
      'Sync fully completed; timing: topic list 1s, topic bodies 0.1s, attachment files 0.1s'
    )).toBe('No changes to sync.');
  });

  it('keeps actual downloaded resource summaries', () => {
    expect(formatSyncResultMessage(
      'Sync fully completed; downloaded 1 topic body in this sync; timing: topic bodies 1s'
    )).toBe('Downloaded 1 topic body in this sync.');
  });

  it('does not report check-only completed events as visible activity', () => {
    expect(isReportableSyncEvent({
      message: 'Sync fully completed; timing: topic list 1s',
      status: 'completed'
    })).toBe(false);
  });

  it('keeps started events out of historical Activity', () => {
    expect(isReportableSyncEvent({
      message: 'Sync started.',
      status: 'started'
    })).toBe(false);
  });
});
