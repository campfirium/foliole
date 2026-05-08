export type CompanionSyncTimeoutKey =
  | 'push_local_changes'
  | 'structure_pack_apply'
  | 'content_body_downloads'
  | 'attachment_resource_downloads'
  | 'workspace_snapshot_refresh';

export interface CompanionSyncTimeoutOwnership {
  allowsNewRunBeforeUnderlyingWorkSettles: boolean;
  cancelsUnderlyingWork: boolean;
  key: CompanionSyncTimeoutKey;
  owner: 'foreground_sync_run' | 'resource_stage' | 'snapshot_refresh';
  stage: string;
  timeoutMs: number;
}

const OWNERSHIP: readonly CompanionSyncTimeoutOwnership[] = [
  {
    allowsNewRunBeforeUnderlyingWorkSettles: true,
    cancelsUnderlyingWork: false,
    key: 'push_local_changes',
    owner: 'foreground_sync_run',
    stage: 'pushing local review changes',
    timeoutMs: 60_000
  },
  {
    allowsNewRunBeforeUnderlyingWorkSettles: false,
    cancelsUnderlyingWork: false,
    key: 'structure_pack_apply',
    owner: 'foreground_sync_run',
    stage: 'applying the structure pack',
    timeoutMs: 45_000
  },
  {
    allowsNewRunBeforeUnderlyingWorkSettles: false,
    cancelsUnderlyingWork: false,
    key: 'content_body_downloads',
    owner: 'resource_stage',
    stage: 'fetching body downloads',
    timeoutMs: 60_000
  },
  {
    allowsNewRunBeforeUnderlyingWorkSettles: false,
    cancelsUnderlyingWork: false,
    key: 'attachment_resource_downloads',
    owner: 'resource_stage',
    stage: 'fetching attachment resources',
    timeoutMs: 60_000
  },
  {
    allowsNewRunBeforeUnderlyingWorkSettles: false,
    cancelsUnderlyingWork: false,
    key: 'workspace_snapshot_refresh',
    owner: 'snapshot_refresh',
    stage: 'refreshing the visible workspace snapshot',
    timeoutMs: 8_000
  }
];

export function companionSyncTimeoutOwnershipTable() {
  return OWNERSHIP.map((entry) => ({ ...entry }));
}

export function companionSyncTimeoutOwnership(key: CompanionSyncTimeoutKey) {
  const entry = OWNERSHIP.find((item) => item.key === key);
  if (!entry) throw new Error(`Unknown companion sync timeout key: ${key}`);
  return entry;
}

export function createCompanionSyncTimeoutError(key: CompanionSyncTimeoutKey) {
  const entry = companionSyncTimeoutOwnership(key);
  return new Error(`Desktop sync timed out while ${entry.stage}.`);
}

export function classifyCompanionSyncTimeoutMessage(message: string) {
  return OWNERSHIP.find((entry) => (
    message.includes(`timed out while ${entry.stage}`)
  )) ?? null;
}
