import { useCallback, useState } from 'react';

import type { CompanionBackupRestoreSource, CompanionBackupRestoreSummary } from '../../lib/platform/companionBackupRestoreContract';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { discardCompanionBackupRestore, stageCompanionBackupRestore } from '../shared/platform/companion/backupRestore/companionBackupRestore';
import { getCompanionBackupRestorePort } from '../shared/platform/companion/backupRestore/companionBackupRestoreRuntimeRepository';
import { getIosCompanionDatabaseOwner, runIosCompanionSideDatabase } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';

import { companionBackupRestoreMessage } from './companionBackupRestoreMessage';

export type CompanionBackupRestoreView =
  | { step: 'closed' }
  | { step: 'choose'; error: string | null }
  | { step: 'reading'; files: number }
  | { step: 'ready'; summary: CompanionBackupRestoreSummary };

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

  /** Reading stops through cancellation; a staged candidate is discarded when the sheet closes. */
  const close = useCallback(() => {
    if (view.step === 'reading') {
      void getCompanionBackupRestorePort().cancel();
      return;
    }
    if (view.step === 'ready') void discardCompanionBackupRestore({ port: getCompanionBackupRestorePort() }).catch(() => undefined);
    setView({ step: 'closed' });
  }, [view.step]);

  return { view, open: () => setView({ step: 'choose', error: null }), choose, close };
}
