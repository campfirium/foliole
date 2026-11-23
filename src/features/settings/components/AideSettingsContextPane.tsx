import {
  createDefaultAideAttachedContextSettings,
  isDefaultAideAttachedContextSettings
} from '../../../../lib/core/assistant/aideAttachedContextSettings';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { SettingsSection } from '../../../shared/ui';
import { useAideAttachedContextSettings } from '../model/useAideAttachedContextSettings';

import { AideSettingsPaneFrame } from './AideSettingsPaneFrame';
import { SettingsAideAttachedContextPreview } from './sections/SettingsAideAttachedContextPreview';
import { SettingsAideAttachedContextSection } from './sections/SettingsAideAttachedContextSection';

export function AideSettingsContextPane() {
  const t = useTranslation();
  const { flush, saveFailed, settings, update } = useAideAttachedContextSettings();
  const isDefault = isDefaultAideAttachedContextSettings(settings);
  return (
    <AideSettingsPaneFrame
      description={t('settings.aideDialog.context.description')}
      onReset={isDefault ? undefined : () => { update(createDefaultAideAttachedContextSettings()); flush(); }}
      resetLabel={t('settings.aideDialog.context.reset')}
      title={t('settings.aideDialog.context.nav')}
    >
      <div className="grid grid-cols-2 items-stretch gap-5 pr-5 max-[1080px]:grid-cols-1 max-[1080px]:pl-5">
        <SettingsSection ariaLabel={t('settings.aideDialog.context.section')} title={t('settings.aideDialog.context.section')}>
          <SettingsAideAttachedContextSection onChange={update} onCommit={flush} settings={settings} />
          {saveFailed ? (
            <p className="mx-settings-panel-x mt-2 text-ui-sm text-destructive" role="alert">{t('settings.aideDialog.context.saveFailed')}</p>
          ) : null}
        </SettingsSection>
        <SettingsAideAttachedContextPreview settings={settings} />
      </div>
    </AideSettingsPaneFrame>
  );
}
