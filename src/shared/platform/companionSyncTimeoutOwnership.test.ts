import { describe, expect, it } from 'vitest';

import {
  classifyCompanionSyncTimeoutMessage,
  companionSyncTimeoutOwnership,
  companionSyncTimeoutOwnershipTable,
  createCompanionSyncTimeoutError
} from './companionSyncTimeoutOwnership';

describe('companion sync timeout ownership', () => {
  it('documents every sync timeout owner and cancellation boundary', () => {
    expect(companionSyncTimeoutOwnershipTable()).toEqual([
      expect.objectContaining({
        cancelsUnderlyingWork: false,
        key: 'push_local_changes',
        owner: 'foreground_sync_run'
      }),
      expect.objectContaining({
        allowsNewRunBeforeUnderlyingWorkSettles: false,
        key: 'structure_pack_apply',
        timeoutMs: 45_000
      }),
      expect.objectContaining({
        key: 'content_body_downloads',
        owner: 'resource_stage',
        stage: 'fetching body downloads'
      }),
      expect.objectContaining({
        key: 'attachment_resource_downloads',
        owner: 'resource_stage'
      }),
      expect.objectContaining({
        key: 'workspace_snapshot_refresh',
        owner: 'snapshot_refresh',
        timeoutMs: 8_000
      })
    ]);
  });

  it('classifies timeout messages back to the owning stage', () => {
    const error = createCompanionSyncTimeoutError('workspace_snapshot_refresh');
    const owner = classifyCompanionSyncTimeoutMessage(error.message);

    expect(owner).toEqual(companionSyncTimeoutOwnership('workspace_snapshot_refresh'));
  });
});
