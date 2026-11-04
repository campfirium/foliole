import { useLocalization } from '../shared/localization/LocalizationProvider';
import { supportsCompanionFolderSync } from '../shared/platform/companion/folderSync/companionFolderSync';
import { AppSpinner, AppSwitch } from '../shared/ui';

import { useCompanionFolderBackupSettings } from './useCompanionFolderBackupSettings';

function FolderSyncControls() {
  const { t, locale } = useLocalization();
  const model = useCompanionFolderBackupSettings();
  const { state, busy, error, running } = model;
  const location = state?.location;
  const completion = location?.completion;
  const saving = running || busy === 'write';
  return <div className="mb-6 border-b border-companion-divider pb-6">
    <div className="flex min-h-11 items-center justify-between gap-4">
      <h3 className="text-base font-semibold text-foreground">{t('companion.settings.folderSync.title')}</h3>
      <AppSwitch aria-label={t('companion.settings.folderSync.title')} checked={state?.enabled ?? false}
        disabled={!state || busy === 'toggle' || busy === 'choose' || busy === 'reload'} onCheckedChange={value => void model.setEnabled(value)} />
    </div>
    <p className="mt-2 text-sm leading-6 text-companion-text-secondary">{t('companion.settings.folderSync.description')}</p>
    {!state && !error ? <p role="status" className="mt-3 text-sm text-companion-text-secondary">{t('companion.settings.folderSync.loading')}</p> : null}
    {location ? <>
      <p className="mt-3 break-words text-sm text-foreground">{location.name}</p>
      {!location.authorized ? <p role="alert" className="mt-2 text-sm text-error">{t('companion.settings.folderSync.permission')}</p> : null}
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" className="min-h-11 rounded-xl border border-companion-divider px-4 py-2 text-sm text-foreground disabled:opacity-45"
          disabled={Boolean(busy) || saving} onClick={() => void model.act('choose')}>{t('companion.settings.folderSync.change')}</button>
        <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-companion-divider px-4 py-2 text-sm text-foreground disabled:opacity-45"
          aria-busy={saving || undefined} disabled={Boolean(busy) || saving || !state?.enabled || !location.authorized} onClick={() => void model.act('write')}>
          {saving ? <AppSpinner decorative size="sm" /> : null}
          {t(saving ? 'companion.settings.folderSync.saving' : 'companion.settings.folderSync.save')}
        </button>
      </div>
      {completion ? <p role="status" className="mt-3 text-sm text-companion-text-secondary">
        {t('companion.settings.folderSync.checked')} {new Date(completion.checkedAt).toLocaleString(locale)}
      </p> : null}
      {completion?.pendingResources ? <p className="mt-2 text-sm text-companion-text-secondary">{t('companion.settings.folderSync.pending')}</p> : null}
    </> : null}
    {error ? <p role="alert" className="mt-3 text-sm text-error">{t('companion.settings.folderSync.error')}</p> : null}
    {error && !state ? <button type="button" className="mt-2 min-h-11 text-sm text-foreground" disabled={Boolean(busy)}
      onClick={() => void model.act('reload')}>{t('companion.settings.folderSync.retry')}</button> : null}
  </div>;
}

export function CompanionFolderSyncSection() {
  return supportsCompanionFolderSync() ? <FolderSyncControls /> : null;
}
