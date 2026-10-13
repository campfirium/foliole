export const ACCEPTANCE_HOLD_AFTER_SYNC_CURSOR_COMMIT =
  'FOLIOLE_ACCEPTANCE_HOLD_AFTER_SYNC_CURSOR_COMMIT';

export async function reportDesktopSyncGroupObjectCommitted(
  object: { objectType: string; globalId: string },
  env: NodeJS.ProcessEnv = process.env
) {
  if (env[ACCEPTANCE_HOLD_AFTER_SYNC_CURSOR_COMMIT] !== '1') return;
  if (object.objectType !== 'node' || !object.globalId.startsWith('sync-from-zero-a-')) return;
  console.info('[sync-group] receive dataset object committed', object);
  await new Promise<void>(() => undefined);
}
