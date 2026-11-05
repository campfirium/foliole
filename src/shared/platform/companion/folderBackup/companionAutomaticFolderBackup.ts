import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { subscribeNativeAppForeground } from '../../appLifecycle';
import type { CapacitorCompanionDatabaseOwner } from '../runtime/capacitorCompanionDatabaseOwner';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

import { backUpCompanionDatabase, forgetCompanionFolderBackupDirectory, subscribeManualCompanionFolderBackup } from './companionFolderBackup';
import { getCompanionFolderBackupPort, supportsCompanionFolderDatabaseBackup } from './companionFolderBackupRuntimeRepository';
import { CompanionFolderBackupWorker } from './companionFolderBackupWorker';

const key = 'folder_backup_automatic';
const listeners = new Set<(enabled: boolean) => void>();
let active: { owner: CapacitorCompanionDatabaseOwner; worker: CompanionFolderBackupWorker; clearing: boolean } | null = null;

export async function readCompanionAutomaticFolderBackup(db: DbPort) {
  const [row] = await db.query<{ value: string }>('SELECT value FROM companion_meta WHERE key=?', [key]);
  return row?.value === 'true';
}

export function subscribeCompanionAutomaticFolderBackup(listener: (enabled: boolean) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export async function getCompanionAutomaticFolderBackup() {
  return getIosCompanionDatabaseOwner().read(readCompanionAutomaticFolderBackup);
}

export async function setCompanionAutomaticFolderBackup(enabled: boolean) {
  const session = active;
  if (!session || session.owner !== getIosCompanionDatabaseOwner()) throw new Error('Backup database owner is not ready.');
  if (enabled && session.clearing) throw new Error('Backup folder is being disconnected.');
  await session.worker.setEnabled(enabled, async () => {
    if (enabled && !(await getCompanionFolderBackupPort().getState()).configured) throw new Error('Choose a backup folder first.');
  });
  for (const listener of listeners) { try { listener(session.worker.automatic); } catch { /* The preference is already saved. */ } }
}

export async function clearCompanionFolderBackupDirectory() {
  const session = active;
  if (!session) throw new Error('Backup database owner is not ready.');
  session.clearing = true;
  try { await setCompanionAutomaticFolderBackup(false); return await forgetCompanionFolderBackupDirectory(); }
  finally { session.clearing = false; }
}

export async function bindCompanionAutomaticFolderBackup(owner: CapacitorCompanionDatabaseOwner) {
  if (!supportsCompanionFolderDatabaseBackup()) return () => undefined;
  const worker = new CompanionFolderBackupWorker(await owner.read(readCompanionAutomaticFolderBackup), {
    saveEnabled: enabled => owner.runWriter(async db => {
      await db.run('INSERT OR REPLACE INTO companion_meta(key,value,updated_at) VALUES (?,?,?)',
        [key, String(enabled), new Date().toISOString()]);
    }, false),
    run: async continueWork => {
      const result = await backUpCompanionDatabase(false, { automatic: true, continueWork });
      return { errorMessage: result.state.errorMessage };
    }
  });
  const session = { owner, worker, clearing: false };
  active = session;
  const committed = owner.committedWrites.subscribe(() => worker.wake(true));
  const manual = subscribeManualCompanionFolderBackup(() => worker.wake(true));
  const foreground = await subscribeNativeAppForeground(() => worker.wake(true));
  worker.wake(true);
  return async () => {
    committed(); manual(); foreground();
    if (active === session) active = null;
    await worker.stop();
  };
}
