import { describe, expect, it } from 'vitest';

import {
  describeCompanionSyncPassResult,
  type CompanionSyncPassInput
} from './companionSyncPassResult';

function passInput(overrides: Partial<CompanionSyncPassInput> = {}): CompanionSyncPassInput {
  return {
    attachmentResourceError: null,
    contentBlobError: null,
    localDirtyCount: 0,
    pendingAckCount: 0,
    pushConflictCount: 0,
    pushError: null,
    pushIssueCount: 0,
    pushRejectedCount: 0,
    remainingAttachmentResourceBytes: null,
    remainingAttachmentResourceCount: 0,
    remainingContentBlobBytes: null,
    remainingContentBlobCount: 0,
    remainingStructureChangeCount: 0,
    ...overrides
  };
}

describe('describeCompanionSyncPassResult local changes', () => {
  it('keeps local dirty and pending ack work out of completed events', () => {
    expect(describeCompanionSyncPassResult(passInput({
      localDirtyCount: 1,
      pendingAckCount: 1
    }))).toEqual({
      message: 'Android changes are still waiting to settle.',
      outcome: 'skipped',
      result: 'blocked',
      status: 'skipped'
    });
  });

  it('keeps pull success visible when push fails', () => {
    expect(describeCompanionSyncPassResult(passInput({
      pushError: 'Desktop sync target returned 500 for /companion/sync-push.',
      remainingContentBlobCount: 3
    }))).toEqual({
      message: 'Android changes could not be sent: Desktop sync target returned 500 for /companion/sync-push.',
      outcome: 'skipped',
      result: 'blocked',
      status: 'skipped'
    });
  });

  it('keeps resource backlog visible when push conflicts need review', () => {
    expect(describeCompanionSyncPassResult(passInput({
      pushConflictCount: 1,
      remainingAttachmentResourceCount: 0,
      remainingContentBlobCount: 3
    }))).toEqual({
      message: '1 Android change needs review before sending.',
      outcome: 'skipped',
      result: 'blocked',
      status: 'skipped'
    });
  });

  it('keeps persisted push issues out of completed events', () => {
    expect(describeCompanionSyncPassResult(passInput({
      pushIssueCount: 1
    }))).toEqual({
      message: '1 Android change needs review before sending.',
      outcome: 'skipped',
      result: 'blocked',
      status: 'skipped'
    });
  });
});

describe('describeCompanionSyncPassResult structure lag', () => {
  it('keeps structure lag out of completed events', () => {
    expect(describeCompanionSyncPassResult(passInput({
      remainingStructureChangeCount: 4
    }))).toEqual({
      message: 'Topic list confirmation is still pending.',
      outcome: 'skipped',
      result: 'partial',
      status: 'skipped'
    });
  });

  it('keeps unknown structure confirmation out of completed events', () => {
    expect(describeCompanionSyncPassResult(passInput({
      remainingStructureChangeCount: null
    }))).toEqual({
      message: 'Topic list confirmation is still pending.',
      outcome: 'skipped',
      result: 'partial',
      status: 'skipped'
    });
  });
});
