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
      message: 'All stages completed.',
      outcome: 'completed',
      result: 'completed',
      status: 'completed'
    });
  });

  it('records downloaded resources when a pass makes progress', () => {
    expect(describeCompanionSyncPassResult(passInput({
      syncedAttachmentIds: ['att-1'],
      syncedAttachmentResourceBytes: 2097152,
      syncedContentBlobBytes: 1048576,
      syncedContentBlobHashes: ['hash-1', 'hash-2'],
      syncedResourceElapsedMs: 8000
    }))).toEqual({
      message: 'All stages completed.',
      outcome: 'completed',
      result: 'completed',
      status: 'completed'
    });
  });
});

describe('describeCompanionSyncPassResult backlog', () => {
  it('keeps body and attachment backlog as a skipped download pass', () => {
    expect(describeCompanionSyncPassResult(passInput({
      remainingAttachmentResourceBytes: 3145728,
      remainingAttachmentResourceCount: 2,
      remainingContentBlobBytes: 5242880,
      remainingContentBlobCount: 5
    }))).toEqual({
      message: 'Resource downloads are still pending.',
      outcome: 'skipped',
      result: 'partial',
      status: 'skipped'
    });
  });

  it('keeps unknown resource counts from claiming backlog or completion', () => {
    expect(describeCompanionSyncPassResult(passInput({
      remainingAttachmentResourceCount: null,
      remainingContentBlobCount: null
    }))).toEqual({
      message: 'Sync checked; resource backlog was not measured in this pass.',
      outcome: 'skipped',
      result: 'partial',
      status: 'skipped'
    });
  });

  it('records progress and remaining backlog together', () => {
    expect(describeCompanionSyncPassResult(passInput({
      remainingContentBlobBytes: 5242880,
      remainingContentBlobCount: 5,
      syncedContentBlobBytes: 1048576,
      syncedContentBlobHashes: ['hash-1'],
      syncedResourceElapsedMs: 65000
    }))).toEqual({
      message: 'Resource downloads made progress and will continue.',
      outcome: 'skipped',
      result: 'partial',
      status: 'skipped'
    });
  });

  it('shows failed downloads separately from ordinary backlog', () => {
    expect(describeCompanionSyncPassResult(passInput({
      remainingContentBlobBytes: 5242880,
      remainingContentBlobCount: 5,
      remainingFailedAttachmentResourceBytes: 524288,
      remainingFailedAttachmentResourceCount: 1,
      remainingFailedContentBlobBytes: 1048576,
      remainingFailedContentBlobCount: 1
    }))).toEqual({
      message: 'Resource downloads need another pass; some downloads failed earlier.',
      outcome: 'skipped',
      result: 'partial',
      status: 'skipped'
    });
  });
});

describe('describeCompanionSyncPassResult push blocks', () => {
  it('keeps resource backlog visible when Android changes need review', () => {
    expect(describeCompanionSyncPassResult(passInput({
      pushIssueCount: 2,
      remainingAttachmentResourceCount: 1,
      remainingContentBlobCount: 3
    }))).toEqual({
      message: '2 Android changes were not sent after desktop rejected or conflicted them. Resource downloads are still pending.',
      outcome: 'skipped',
      result: 'partial',
      status: 'skipped'
    });
  });

  it('keeps structure confirmation visible when Android push fails', () => {
    expect(describeCompanionSyncPassResult(passInput({
      pushError: 'Desktop sync target returned 500 for /companion/sync-push.',
      remainingStructureChangeCount: 2
    }))).toEqual({
      message: 'Android changes were not sent: Desktop sync target returned 500 for /companion/sync-push. Topic list confirmation is still pending.',
      outcome: 'skipped',
      result: 'partial',
      status: 'skipped'
    });
  });
});

describe('describeCompanionSyncPassResult timing', () => {
  it('records stage timing when a pass completes', () => {
    expect(describeCompanionSyncPassResult(passInput({
      syncedAttachmentIds: ['att-1'],
      syncedAttachmentResourceElapsedMs: 12200,
      syncedContentBlobElapsedMs: 8100,
      syncedContentBlobHashes: ['hash-1'],
      syncedResourceElapsedMs: 20300,
      syncedStructureElapsedMs: 1300
    }))).toEqual({
      message: 'All stages completed.',
      outcome: 'completed',
      result: 'completed',
      status: 'completed'
    });
  });

  it('records native topic body timing when Android reports batch internals', () => {
    expect(describeCompanionSyncPassResult(passInput({
      syncedContentBlobHashes: ['hash-1'],
      syncedContentBlobNativeTiming: {
        dbElapsedMs: 450,
        httpElapsedMs: 1200,
        parseElapsedMs: 80,
        totalElapsedMs: 1800
      }
    }))).toEqual({
      message: 'All stages completed.',
      outcome: 'completed',
      result: 'completed',
      status: 'completed'
    });
  });
});

describe('describeCompanionSyncPassResult errors', () => {
  it('keeps a body download error on the backlog retry path when bodies remain', () => {
    expect(describeCompanionSyncPassResult(passInput({
      contentBlobError: 'Topic body batch could not download any requested body.',
      remainingContentBlobCount: 5
    }))).toEqual({
      message: 'Sync checked; body downloads could not finish in this pass: Topic body batch could not download any requested body.',
      outcome: 'skipped',
      result: 'partial',
      status: 'skipped'
    });
  });

  it('keeps an attachment download error on the backlog retry path when attachments remain', () => {
    expect(describeCompanionSyncPassResult(passInput({
      attachmentResourceError: 'Attachment file batch could not download any requested file.',
      remainingAttachmentResourceCount: 2
    }))).toEqual({
      message: 'Sync checked; attachment files could not download in this pass: Attachment file batch could not download any requested file.',
      outcome: 'skipped',
      result: 'partial',
      status: 'skipped'
    });
  });

  it('marks a body download error failed when no body backlog remains', () => {
    expect(describeCompanionSyncPassResult(passInput({
      contentBlobError: 'Topic body batch could not download any requested body.'
    }))).toEqual({
      message: 'Body download failed: Topic body batch could not download any requested body.',
      outcome: 'failed',
      result: 'failed',
      status: 'failed'
    });
  });
});
