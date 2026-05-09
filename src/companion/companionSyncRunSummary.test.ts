import { describe, expect, it } from 'vitest';

import type { CompanionDesktopSyncResult } from '../shared/platform/companionDesktopSyncObjects';

import { buildCompanionSyncRunSummary } from './companionSyncRunSummary';

function syncResult(overrides: Partial<CompanionDesktopSyncResult> = {}): CompanionDesktopSyncResult {
  return {
    appliedNodeIds: [],
    appliedObjectIds: [],
    appliedPackBlobCount: 0,
    appliedPackObjectCount: 0,
    appliedReviewOpIds: [],
    attachmentResourceError: null,
    changedObjectIds: [],
    contentBlobError: null,
    localDirtyCount: 0,
    pendingAckCount: 0,
    pushConflictCount: 0,
    pushedNodeIds: [],
    pushedObjectIds: [],
    pushedReviewOpIds: [],
    pushError: null,
    pushIssueCount: 0,
    pushRejectedCount: 0,
    remainingAttachmentResourceBytes: 0,
    remainingAttachmentResourceCount: 0,
    remainingContentBlobBytes: 0,
    remainingContentBlobCount: 0,
    remainingFailedAttachmentResourceBytes: 0,
    remainingFailedAttachmentResourceCount: 0,
    remainingFailedContentBlobBytes: 0,
    remainingFailedContentBlobCount: 0,
    requestedObjectIds: [],
    syncedAttachmentIds: [],
    syncedAttachmentResourceBytes: 0,
    syncedContentBlobBytes: 0,
    syncedContentBlobHashes: [],
    syncedResourceElapsedMs: 0,
    ...overrides
  };
}

describe('buildCompanionSyncRunSummary', () => {
  it('aggregates pull and push work into one changes count', () => {
    expect(buildCompanionSyncRunSummary({
      occurredAt: '2026-05-09T06:42:08.000Z',
      result: syncResult({
        appliedPackObjectCount: 3,
        pushedObjectIds: ['topic:1'],
        pushedReviewOpIds: ['review:1'],
        syncedAttachmentIds: ['attachment:1'],
        syncedContentBlobHashes: ['hash:1']
      }),
      startedAt: '2026-05-09T06:42:00.000Z'
    })).toMatchObject({
      change_count: 7,
      duration_ms: 8_000
    });
  });

  it('separates desktop review from confirmation and send waiting states', () => {
    expect(buildCompanionSyncRunSummary({
      occurredAt: '2026-05-09T06:42:08.000Z',
      result: syncResult({ pendingAckCount: 2 }),
      startedAt: '2026-05-09T06:42:00.000Z'
    }).waiting_confirmation_count).toBe(2);

    expect(buildCompanionSyncRunSummary({
      occurredAt: '2026-05-09T06:42:08.000Z',
      result: syncResult({ pushConflictCount: 1, pushRejectedCount: 1 }),
      startedAt: '2026-05-09T06:42:00.000Z'
    }).desktop_review_count).toBe(2);
  });
});
