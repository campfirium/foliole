export type CompanionSyncTimeoutKey =
  | 'push_local_changes'
  | 'structure_pack_apply'
  | 'content_body_downloads'
  | 'attachment_resource_downloads'
  | 'workspace_snapshot_refresh';

interface CompanionSyncTimeoutOwnership {
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

export async function withSyncStepTimeout<T>(
  key: CompanionSyncTimeoutKey,
  work: Promise<T>,
): Promise<T> {
  const ownership = companionSyncTimeoutOwnership(key);
  const timeoutMs = ownership.timeoutMs;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<'timeout'>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve('timeout');
    }, timeoutMs);
  });
  const wrappedWork = work.then(
    (value) => ({ status: 'fulfilled' as const, value }),
    (error) => ({ status: 'rejected' as const, error })
  );
  try {
    const result = await Promise.race([wrappedWork, timeout]);
    if (result === 'timeout') {
      if (!ownership.cancelsUnderlyingWork && !ownership.allowsNewRunBeforeUnderlyingWorkSettles) {
        return await work;
      }
      throw createCompanionSyncTimeoutError(key);
    }
    if (result.status === 'rejected') {
      throw result.error;
    }
    return result.value;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export function classifyCompanionSyncTimeoutMessage(message: string) {
  return OWNERSHIP.find((entry) => (
    message.includes(`timed out while ${entry.stage}`)
  )) ?? null;
}
