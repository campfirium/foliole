import { useCallback, useState } from 'react';

import type { CompanionBackupRestoreSource, CompanionBackupRestoreSummary } from '../../lib/platform/companionBackupRestoreContract';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import {
  commitCompanionBackupRestore,
  discardCompanionBackupRestore,
  stageCompanionBackupRestore
} from '../shared/platform/companion/backupRestore/companionBackupRestore';
import { getCompanionBackupRestorePort } from '../shared/platform/companion/backupRestore/companionBackupRestoreRuntimeRepository';
import { settleCompanionFolderBackups } from '../shared/platform/companion/folderBackup/companionFolderBackup';
import { getCompanionFolderBackupPort } from '../shared/platform/companion/folderBackup/companionFolderBackupRuntimeRepository';
import { runWithCompanionAttachmentMaintenance } from '../shared/platform/companion/runtime/companionAttachmentMaintenance';
import {
  closeIosCompanionDatabase,
  getIosCompanionDatabaseOwner,
  runIosCompanionSideDatabase
} from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';

import { companionBackupRestoreMessage } from './companionBackupRestoreMessage';
import { closeForCompanionLibrarySwitch, failCompanionLibrarySwitch } from './companionLibrarySwitch';

export type CompanionBackupRestoreView =
  | { step: 'closed' }
  | { step: 'choose'; error: string | null }
  | { step: 'reading'; files: number }
  | { step: 'ready'; summary: CompanionBackupRestoreSummary }
  | { step: 'confirm'; summary: CompanionBackupRestoreSummary; replacesPrevious: boolean }
  | { step: 'replacing' }
  | { step: 'failed'; error: string };

export function reloadCompanionApp() { window.location.reload(); }

/** Everything a library swap needs from the running app: one writer queue, then a reload. */
export function companionLibrarySwapContext() {
  return {
    owner: getIosCompanionDatabaseOwner(), port: getCompanionBackupRestorePort(),
    settleBackups: settleCompanionFolderBackups,
    exclusive: runWithCompanionAttachmentMaintenance,
    closeDatabase: () => closeForCompanionLibrarySwitch(closeIosCompanionDatabase),
    forgetBackupFolder: () => getCompanionFolderBackupPort().clearDirectory(), reload: reloadCompanionApp
  };
}

export function useCompanionBackupRestore() {
  const t = useTranslation();
  const [view, setView] = useState<CompanionBackupRestoreView>({ step: 'closed' });

  const choose = useCallback(async (source: CompanionBackupRestoreSource) => {
    const port = getCompanionBackupRestorePort();
    setView({ step: 'reading', files: 0 });
    const listener = await port.addListener('restoreProgress', ({ files }) => setView({ step: 'reading', files }));
    try {
      const staged = await stageCompanionBackupRestore({
        owner: getIosCompanionDatabaseOwner(), openCandidate: runIosCompanionSideDatabase, port
      }, source);
      setView(staged.cancelled ? { step: 'choose', error: null } : { step: 'ready', summary: staged.summary });
    } catch (error) {
      setView({ step: 'choose', error: companionBackupRestoreMessage(error, t) });
    } finally {
      await listener.remove().catch(() => undefined);
    }
  }, [t]);

  const requestReplace = useCallback(async (summary: CompanionBackupRestoreSummary) => {
    const previous = await getCompanionBackupRestorePort().previous().catch(() => ({ exists: false }));
    setView({ step: 'confirm', summary, replacesPrevious: previous.exists });
  }, []);

  const replace = useCallback(async () => {
    setView({ step: 'replacing' });
    try {
      await commitCompanionBackupRestore(companionLibrarySwapContext());
    } catch (error) {
      const message = companionBackupRestoreMessage(error, t);
      if (!failCompanionLibrarySwitch(message)) setView({ step: 'failed', error: message });
    }
  }, [t]);

  /** Reading stops through cancellation; a staged candidate is discarded when the sheet closes. */
  const close = useCallback(() => {
    if (view.step === 'replacing') return;
    if (view.step === 'reading') {
      void getCompanionBackupRestorePort().cancel();
      return;
    }
    if (view.step === 'confirm') { setView({ step: 'ready', summary: view.summary }); return; }
    if (view.step === 'failed') { reloadCompanionApp(); return; }
    if (view.step === 'ready') void discardCompanionBackupRestore({ port: getCompanionBackupRestorePort() }).catch(() => undefined);
    setView({ step: 'closed' });
  }, [view]);

  return { view, open: () => setView({ step: 'choose', error: null }), choose, requestReplace, replace, close };
}
