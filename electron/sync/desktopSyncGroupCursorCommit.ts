export const ACCEPTANCE_HOLD_AFTER_SYNC_CURSOR_COMMIT =
  'FOLIOLE_ACCEPTANCE_HOLD_AFTER_SYNC_CURSOR_COMMIT';

export async function reportDesktopSyncGroupCursorCommitted(
  event: { cursor: number; peerAuthorizationId: string },
  env: NodeJS.ProcessEnv = process.env
) {
  console.info('[sync-group] receive cursor committed', event);
  if (env[ACCEPTANCE_HOLD_AFTER_SYNC_CURSOR_COMMIT] !== '1') return;
  await new Promise<void>(() => undefined);
}
