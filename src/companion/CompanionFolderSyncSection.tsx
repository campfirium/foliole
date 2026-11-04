import { useEffect, useState } from 'react';

import { useLocalization } from '../shared/localization/LocalizationProvider';
import { companionFolderSync, readCompanionFolderSyncState, supportsCompanionFolderSync } from '../shared/platform/companion/folderSync/companionFolderSync';
import { AppSpinner } from '../shared/ui';

type State = Awaited<ReturnType<typeof readCompanionFolderSyncState>>;

function FolderSyncControls() {
  const { t, locale } = useLocalization();
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState<'choose' | 'write' | 'reload' | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let current = true;
    void readCompanionFolderSyncState().then(value => { if (current) setState(value); })
      .catch(() => { if (current) setError(true); });
    return () => { current = false; };
  }, []);

  async function act(action: 'choose' | 'write' | 'reload') {
    setBusy(action);
    setError(false);
    try {
      if (action === 'choose') await companionFolderSync.choose();
      else if (action === 'write') await companionFolderSync.write();
      setState(await readCompanionFolderSyncState());
    } catch {
      setError(true);
      try { setState(await readCompanionFolderSyncState()); } catch { /* Retain the visible location if rechecking fails. */ }
    } finally { setBusy(null); }
  }

  const location = state?.location;
  const completion = location?.completion;
  return <div className="mb-6 border-b border-companion-divider pb-6">
    <h3 className="text-base font-semibold text-foreground">{t('companion.settings.folderSync.title')}</h3>
    <p className="mt-2 text-sm leading-6 text-companion-text-secondary">{t('companion.settings.folderSync.description')}</p>
    {!state && !error ? <p role="status" className="mt-3 text-sm text-companion-text-secondary">{t('companion.settings.folderSync.loading')}</p> : null}
    {state?.deviceSyncConfigured ? <p className="mt-3 text-sm text-companion-text-secondary">{t('companion.settings.folderSync.deviceSync')}</p> : <>
      {location ? <p className="mt-3 break-words text-sm text-foreground">{location.name}</p> : null}
      {location && !location.authorized ? <p role="alert" className="mt-2 text-sm text-error">{t('companion.settings.folderSync.permission')}</p> : null}
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" className="min-h-11 rounded-xl border border-companion-divider px-4 py-2 text-sm text-foreground disabled:opacity-45"
          disabled={Boolean(busy) || !state} onClick={() => void act('choose')}>
          {t(location ? 'companion.settings.folderSync.change' : 'companion.settings.folderSync.choose')}
        </button>
        {location ? <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-companion-divider px-4 py-2 text-sm text-foreground disabled:opacity-45"
          aria-busy={busy === 'write' || undefined} disabled={Boolean(busy) || !location.authorized} onClick={() => void act('write')}>
          {busy === 'write' ? <AppSpinner decorative size="sm" /> : null}
          {t(busy === 'write' ? 'companion.settings.folderSync.saving' : 'companion.settings.folderSync.save')}
        </button> : null}
      </div>
      {completion ? <p role="status" className="mt-3 text-sm text-companion-text-secondary">
        {t('companion.settings.folderSync.checked')} {new Date(completion.checkedAt).toLocaleString(locale)}
      </p> : null}
      {completion?.pendingResources ? <p className="mt-2 text-sm text-companion-text-secondary">{t('companion.settings.folderSync.pending')}</p> : null}
    </>}
    {error ? <p role="alert" className="mt-3 text-sm text-error">{t('companion.settings.folderSync.error')}</p> : null}
    {error && !state ? <button type="button" className="mt-2 min-h-11 text-sm text-foreground" disabled={Boolean(busy)}
      onClick={() => void act('reload')}>{t('companion.settings.folderSync.retry')}</button> : null}
  </div>;
}

export function CompanionFolderSyncSection() {
  return supportsCompanionFolderSync() ? <FolderSyncControls /> : null;
}
