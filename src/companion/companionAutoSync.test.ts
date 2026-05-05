import { describe, expect, it } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';

import {
  AUTO_SYNC_MIN_INTERVAL_MS,
  shouldAutoPullInitialDesktopSnapshot,
  shouldPullUpdatedDesktopSnapshot,
  shouldRunForegroundAutoSyncCheck
} from './companionAutoSync';

function createWorkspaceSnapshot(): WorkspaceSnapshot {
  return {
    activeNodeId: null,
    nodeOrder: [],
    nodesById: {},
    trashedNodeIds: [],
    untitledSequenceByParent: {}
  };
}

function expectNoInitialAutoPull(args: {
  endpoint_url: string | null;
  isNativeRuntime: boolean;
  last_synced_at: string | null;
  remembered_targets?: string[];
  workspace_snapshot: WorkspaceSnapshot | null;
}) {
  expect(
    shouldAutoPullInitialDesktopSnapshot({
      isNativeRuntime: args.isNativeRuntime,
      state: {
        endpoint_url: args.endpoint_url,
        last_synced_at: args.last_synced_at,
        remembered_targets: args.remembered_targets ?? [],
        workspace_snapshot: args.workspace_snapshot
      }
    })
  ).toBe(false);
}

describe('shouldAutoPullInitialDesktopSnapshot', () => {
  it('returns false for native runtime with no saved sync state because sync is manual', () => {
    expectNoInitialAutoPull({
      endpoint_url: null,
      isNativeRuntime: true,
      last_synced_at: null,
      workspace_snapshot: null
    });
  });

  it('returns false outside native runtime', () => {
    expectNoInitialAutoPull({
      endpoint_url: null,
      isNativeRuntime: false,
      last_synced_at: null,
      workspace_snapshot: null
    });
  });

  it('returns false once any sync state already exists', () => {
    expectNoInitialAutoPull({
      endpoint_url: 'http://10.0.2.2:38641',
      isNativeRuntime: true,
      last_synced_at: '2026-04-22T04:00:00.000Z',
      workspace_snapshot: createWorkspaceSnapshot()
    });
  });

  it('still returns false when endpoint exists but snapshot has never been pulled', () => {
    expectNoInitialAutoPull({
      endpoint_url: 'http://10.0.2.2:38641',
      isNativeRuntime: true,
      last_synced_at: null,
      workspace_snapshot: null
    });
  });
});

describe('shouldPullUpdatedDesktopSnapshot', () => {
  it('pulls when desktop exported_at is newer than local last_synced_at', () => {
    expect(
      shouldPullUpdatedDesktopSnapshot({
        lastSyncedAt: '2026-04-22T04:00:00.000Z',
        remoteExportedAt: '2026-04-22T04:01:00.000Z'
      })
    ).toBe(true);
  });

  it('skips pull when desktop exported_at is not newer', () => {
    expect(
      shouldPullUpdatedDesktopSnapshot({
        lastSyncedAt: '2026-04-22T04:01:00.000Z',
        remoteExportedAt: '2026-04-22T04:01:00.000Z'
      })
    ).toBe(false);
  });
});

describe('shouldRunForegroundAutoSyncCheck', () => {
  it('returns false because paired companion stays quiet in foreground transitions', () => {
    expect(
      shouldRunForegroundAutoSyncCheck({
        isNativeRuntime: true,
        lastCheckedAt: 1_000,
        now: 1_000 + AUTO_SYNC_MIN_INTERVAL_MS - 1
      })
    ).toBe(false);
    expect(
      shouldRunForegroundAutoSyncCheck({
        isNativeRuntime: true,
        lastCheckedAt: 1_000,
        now: 1_000 + AUTO_SYNC_MIN_INTERVAL_MS
      })
    ).toBe(false);
  });
});
