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
    pushRejectedCount: 0,
    remainingAttachmentResourceBytes: null,
    remainingAttachmentResourceCount: 0,
    remainingContentBlobBytes: null,
    remainingContentBlobCount: 0,
    ...overrides
  };
}

describe('describeCompanionSyncPassResult', () => {
  it('marks the pass completed only when resources and local work are clear', () => {
    expect(describeCompanionSyncPassResult(passInput())).toEqual({
      message: 'Sync completed.',
      outcome: 'completed',
      status: 'completed'
    });
  });

  it('keeps body and attachment backlog as a skipped caching pass', () => {
    expect(describeCompanionSyncPassResult(passInput({
      remainingAttachmentResourceBytes: 3145728,
      remainingAttachmentResourceCount: 2,
      remainingContentBlobBytes: 5242880,
      remainingContentBlobCount: 5
    }))).toEqual({
      message: 'Sync pass finished; 5 topic bodies (5.0 MB) and 2 attachment files (3.0 MB) still caching.',
      outcome: 'skipped',
      status: 'skipped'
    });
  });

  it('keeps local dirty and pending ack work out of completed events', () => {
    expect(describeCompanionSyncPassResult(passInput({
      localDirtyCount: 1,
      pendingAckCount: 1
    }))).toEqual({
      message: 'Sync pass finished; local changes are still waiting to settle.',
      outcome: 'skipped',
      status: 'skipped'
    });
  });

  it('keeps pull success visible when push fails', () => {
    expect(describeCompanionSyncPassResult(passInput({
      pushError: 'Desktop sync target returned 500 for /companion/sync-push.',
      remainingContentBlobCount: 3
    }))).toEqual({
      message: 'Sync pass finished; device changes could not be sent: Desktop sync target returned 500 for /companion/sync-push.; 3 topic bodies still caching.',
      outcome: 'skipped',
      status: 'skipped'
    });
  });
});
