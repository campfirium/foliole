import {
  createDefaultAideAttachedContextSettings,
  isDefaultAideAttachedContextSettings
} from '../../../../lib/core/assistant/aideAttachedContextSettings';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppDialogDescription, SettingsButton, SettingsSection } from '../../../shared/ui';
import { useAideAttachedContextSettings } from '../model/useAideAttachedContextSettings';

import { SettingsAideAttachedContextPreview } from './sections/SettingsAideAttachedContextPreview';
import { SettingsAideAttachedContextSection } from './sections/SettingsAideAttachedContextSection';

export function AideSettingsContextPane() {
  const t = useTranslation();
  const { flush, saveFailed, settings, update } = useAideAttachedContextSettings();
  const isDefault = isDefaultAideAttachedContextSettings(settings);
  return (
    <>
      <div className="mb-7 flex items-start justify-between gap-6 px-5 pb-6">
        <div>
          <h2 className="m-0 text-xl font-semibold text-foreground">{t('settings.aideDialog.context.nav')}</h2>
          <AppDialogDescription className="mt-1 max-w-[760px] text-sm leading-6 text-muted-foreground" id="aide-settings-description">
            {t('settings.aideDialog.context.description')}
          </AppDialogDescription>
        </div>
        {isDefault ? null : (
          <SettingsButton onClick={() => { update(createDefaultAideAttachedContextSettings()); flush(); }}>
            {t('settings.aideDialog.context.reset')}
          </SettingsButton>
        )}
      </div>
      <div className="grid grid-cols-2 items-stretch gap-5 pr-5 max-[1080px]:grid-cols-1 max-[1080px]:pl-5">
        <SettingsSection ariaLabel={t('settings.aideDialog.context.section')} title={t('settings.aideDialog.context.section')}>
          <SettingsAideAttachedContextSection onChange={update} onCommit={flush} settings={settings} />
          {saveFailed ? (
            <p className="mx-settings-panel-x mt-2 text-ui-sm text-destructive" role="alert">{t('settings.aideDialog.context.saveFailed')}</p>
          ) : null}
        </SettingsSection>
        <SettingsAideAttachedContextPreview settings={settings} />
      </div>
    </>
  );
}
