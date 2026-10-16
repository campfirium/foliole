import { describe, expect, it } from 'vitest';

import {
  describeCompanionSyncPassResult,
  type CompanionSyncPassInput
} from './companionSyncPassResult';

function passInput(overrides: Partial<CompanionSyncPassInput> = {}): CompanionSyncPassInput {
  return {
    attachmentResourceError: null,
    localDirtyCount: 0,
    pendingAckCount: 0,
    pushConflictCount: 0,
    pushError: null,
    pushIssueCount: 0,
    pushRejectedCount: 0,
    remainingAttachmentResourceBytes: null,
    remainingAttachmentResourceCount: 0,
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
      transferredAttachmentCount: 1,
    }))).toEqual({
      message: 'All stages completed.',
      outcome: 'completed',
      result: 'completed',
      status: 'completed'
    });
  });
});

describe('describeCompanionSyncPassResult backlog', () => {
  it('keeps attachment backlog as a skipped download pass', () => {
    expect(describeCompanionSyncPassResult(passInput({
      remainingAttachmentResourceBytes: 3145728,
      remainingAttachmentResourceCount: 2,
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
    }))).toEqual({
      message: 'Sync checked; resource backlog was not measured in this pass.',
      outcome: 'skipped',
      result: 'partial',
      status: 'skipped'
    });
  });

  it('records progress and remaining backlog together', () => {
    expect(describeCompanionSyncPassResult(passInput({
      remainingAttachmentResourceBytes: 5242880,
      remainingAttachmentResourceCount: 5,
      transferredAttachmentCount: 1,
    }))).toEqual({
      message: 'Resource downloads made progress and will continue.',
      outcome: 'skipped',
      result: 'partial',
      status: 'skipped'
    });
  });

  it('shows failed downloads separately from ordinary backlog', () => {
    expect(describeCompanionSyncPassResult(passInput({
      remainingAttachmentResourceBytes: 5242880,
      remainingAttachmentResourceCount: 5,
      remainingFailedAttachmentResourceBytes: 524288,
      remainingFailedAttachmentResourceCount: 1,
    }))).toEqual({
      message: 'Resource downloads need another pass; some downloads failed earlier.',
      outcome: 'skipped',
      result: 'partial',
      status: 'skipped'
    });
  });
});

describe('describeCompanionSyncPassResult push blocks', () => {
  it('keeps resource backlog visible when device changes need review', () => {
    expect(describeCompanionSyncPassResult(passInput({
      pushIssueCount: 2,
      remainingAttachmentResourceCount: 1,
    }))).toEqual({
      message: '2 device changes were not sent after desktop rejected or conflicted them. Resource downloads are still pending.',
      outcome: 'skipped',
      result: 'waiting',
      status: 'skipped'
    });
  });

  it('keeps structure confirmation visible when device push fails', () => {
    expect(describeCompanionSyncPassResult(passInput({
      pushError: 'Desktop sync target returned 500 for /companion/sync-push.',
      remainingStructureChangeCount: 2
    }))).toEqual({
      message: 'Device changes were not sent: Desktop sync target returned 500 for /companion/sync-push. Text and state are waiting for confirmation.',
      outcome: 'skipped',
      result: 'retrying',
      status: 'skipped'
    });
  });
});

describe('describeCompanionSyncPassResult timing', () => {
  it('keeps diagnostic timing out of the completion message', () => {
    expect(describeCompanionSyncPassResult(passInput({
      transferredAttachmentCount: 1,
      syncedAttachmentResourceElapsedMs: 12200,
      syncedStructureElapsedMs: 1300
    }))).toEqual({
      message: 'All stages completed.',
      outcome: 'completed',
      result: 'completed',
      status: 'completed'
    });
  });


});

describe('describeCompanionSyncPassResult errors', () => {
  it('keeps a attachment download error on the backlog retry path when attachments remain', () => {
    expect(describeCompanionSyncPassResult(passInput({
      attachmentResourceError: 'Attachment file batch could not download any requested file.',
      remainingAttachmentResourceCount: 5
    }))).toEqual({
      message: 'Sync checked; attachment files could not download in this pass: Attachment file batch could not download any requested file.',
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

  it('marks a attachment download error failed when no attachment backlog remains', () => {
    expect(describeCompanionSyncPassResult(passInput({
      attachmentResourceError: 'Attachment file batch could not download any requested file.'
    }))).toEqual({
      message: 'Attachment download failed: Attachment file batch could not download any requested file.',
      outcome: 'failed',
      result: 'failed',
      status: 'failed'
    });
  });
});

it('uses the actual attachment transfer count to report progress', () => {
  expect(describeCompanionSyncPassResult(passInput({
    transferredAttachmentCount: 1, remainingAttachmentResourceCount: 2
  }))).toMatchObject({ result: 'partial', outcome: 'skipped',
    message: 'Resource downloads made progress and will continue.' });
});
