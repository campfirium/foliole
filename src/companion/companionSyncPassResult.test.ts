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
      syncedContentBlobHashes: ['hash-1', 'hash-2'],
      syncedResourceElapsedMs: 8000
    }))).toEqual({
      message: 'Sync fully completed; downloaded 2 topic bodies (1.0 MB) and 1 attachment file (2.0 MB) in this sync in 8s',
      outcome: 'completed',
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
      message: 'Sync checked; 5 topic bodies (5.0 MB) and 2 attachment files (3.0 MB) left to download.',
      outcome: 'skipped',
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
      message: 'Sync made progress; downloaded 1 topic body (1.0 MB) in this sync in 1m 5s; 5 topic bodies (5.0 MB) still downloading.',
      outcome: 'skipped',
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
      message: 'Sync checked; 5 topic bodies (5.0 MB) left to download, 1 topic body download (1.0 MB) failed earlier, and 1 attachment download (512 KB) failed earlier.',
      outcome: 'skipped',
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
      message: 'Sync fully completed; downloaded 1 topic body and 1 attachment file in this sync in 20s; timing: topic list 1s, topic bodies 8s, attachment files 12s',
      outcome: 'completed',
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
      message: 'Sync fully completed; downloaded 1 topic body in this sync; body internals: http 1s, parse 0.1s, db 0.5s',
      outcome: 'completed',
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
      message: 'Sync checked; topic bodies could not download in this pass: Topic body batch could not download any requested body; 5 topic bodies left to download.',
      outcome: 'skipped',
      status: 'skipped'
    });
  });

  it('keeps an attachment download error on the backlog retry path when attachments remain', () => {
    expect(describeCompanionSyncPassResult(passInput({
      attachmentResourceError: 'Attachment file batch could not download any requested file.',
      remainingAttachmentResourceCount: 2
    }))).toEqual({
      message: 'Sync checked; attachment files could not download in this pass: Attachment file batch could not download any requested file; 2 attachment files left to download.',
      outcome: 'skipped',
      status: 'skipped'
    });
  });

  it('marks a body download error failed when no body backlog remains', () => {
    expect(describeCompanionSyncPassResult(passInput({
      contentBlobError: 'Topic body batch could not download any requested body.'
    }))).toEqual({
      message: 'Topic body download failed: Topic body batch could not download any requested body.',
      outcome: 'failed',
      status: 'failed'
    });
  });
});

describe('describeCompanionSyncPassResult local changes', () => {
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
      message: 'Sync checked; device changes could not be sent: Desktop sync target returned 500 for /companion/sync-push; 3 topic bodies left to download.',
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
      message: 'Sync checked; 1 device change needs review before sending; 3 topic bodies left to download.',
      outcome: 'skipped',
      status: 'skipped'
    });
  });

  it('keeps persisted push issues out of completed events', () => {
    expect(describeCompanionSyncPassResult(passInput({
      pushIssueCount: 1
    }))).toEqual({
      message: 'Sync checked; 1 device change needs review before sending.',
      outcome: 'skipped',
      status: 'skipped'
    });
  });
});

describe('describeCompanionSyncPassResult structure lag', () => {
  it('keeps structure lag out of completed events', () => {
    expect(describeCompanionSyncPassResult(passInput({
      remainingStructureChangeCount: 4
    }))).toEqual({
      message: 'Sync checked; 4 topic list changes are still applying.',
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
