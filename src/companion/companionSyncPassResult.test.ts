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

describe('describeCompanionSyncPassResult', () => {
  it('marks the pass completed only when resources and local work are clear', () => {
    expect(describeCompanionSyncPassResult(passInput())).toEqual({
      message: 'Sync fully completed.',
      outcome: 'completed',
      status: 'completed'
    });
  });

  it('records downloaded resources when a pass makes progress', () => {
    expect(describeCompanionSyncPassResult(passInput({
      syncedAttachmentIds: ['att-1'],
      syncedAttachmentResourceBytes: 2097152,
      syncedContentBlobBytes: 1048576,
      syncedContentBlobHashes: ['hash-1', 'hash-2']
    }))).toEqual({
      message: 'Sync fully completed; downloaded 2 topic bodies (1.0 MB) and 1 attachment file (2.0 MB) in this sync',
      outcome: 'completed',
      status: 'completed'
    });
  });

  it('keeps body and attachment backlog as a skipped download pass', () => {
    expect(describeCompanionSyncPassResult(passInput({
      remainingAttachmentResourceBytes: 3145728,
      remainingAttachmentResourceCount: 2,
      remainingContentBlobBytes: 5242880,
      remainingContentBlobCount: 5
    }))).toEqual({
      message: 'Sync checked; 5 topic bodies (5.0 MB) and 2 attachment files (3.0 MB) still downloading.',
      outcome: 'skipped',
      status: 'skipped'
    });
  });

  it('records progress and remaining backlog together', () => {
    expect(describeCompanionSyncPassResult(passInput({
      remainingContentBlobBytes: 5242880,
      remainingContentBlobCount: 5,
      syncedContentBlobBytes: 1048576,
      syncedContentBlobHashes: ['hash-1']
    }))).toEqual({
      message: 'Sync made progress; downloaded 1 topic body (1.0 MB) in this sync; 5 topic bodies (5.0 MB) still downloading.',
      outcome: 'skipped',
      status: 'skipped'
    });
  });

  it('keeps local dirty and pending ack work out of completed events', () => {
    expect(describeCompanionSyncPassResult(passInput({
      localDirtyCount: 1,
      pendingAckCount: 1
    }))).toEqual({
      message: 'Sync checked; local changes are still waiting to settle.',
      outcome: 'skipped',
      status: 'skipped'
    });
  });

  it('keeps pull success visible when push fails', () => {
    expect(describeCompanionSyncPassResult(passInput({
      pushError: 'Desktop sync target returned 500 for /companion/sync-push.',
      remainingContentBlobCount: 3
    }))).toEqual({
      message: 'Sync checked; device changes could not be sent: Desktop sync target returned 500 for /companion/sync-push; 3 topic bodies still downloading.',
      outcome: 'skipped',
      status: 'skipped'
    });
  });

  it('keeps resource backlog visible when push conflicts need review', () => {
    expect(describeCompanionSyncPassResult(passInput({
      pushConflictCount: 1,
      remainingAttachmentResourceCount: 0,
      remainingContentBlobCount: 3
    }))).toEqual({
      message: 'Sync checked; 1 device change(s) need review before they can be sent; 3 topic bodies still downloading.',
      outcome: 'skipped',
      status: 'skipped'
    });
  });

  it('keeps persisted push issues out of completed events', () => {
    expect(describeCompanionSyncPassResult(passInput({
      pushIssueCount: 1
    }))).toEqual({
      message: 'Sync checked; 1 device change(s) need review before they can be sent.',
      outcome: 'skipped',
      status: 'skipped'
    });
  });

  it('keeps structure lag out of completed events', () => {
    expect(describeCompanionSyncPassResult(passInput({
      remainingStructureChangeCount: 4
    }))).toEqual({
      message: 'Sync checked; 4 topic list change(s) still applying.',
      outcome: 'skipped',
      status: 'skipped'
    });
  });

  it('keeps unknown structure confirmation out of completed events', () => {
    expect(describeCompanionSyncPassResult(passInput({
      remainingStructureChangeCount: null
    }))).toEqual({
      message: 'Sync checked; topic list confirmation is still pending.',
      outcome: 'skipped',
      status: 'skipped'
    });
  });
});
