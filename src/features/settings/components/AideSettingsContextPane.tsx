import { useState } from 'react';

import {
  type AideAttachedContextItemKey,
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
  // The item under the pointer or keyboard focus; its preview segment is highlighted and scrolled level with the row.
  const [active, setActive] = useState<{ key: AideAttachedContextItemKey; rowTop: number } | null>(null);
  return (
    <AideSettingsPaneFrame
      description={t('settings.aideDialog.context.description')}
      onReset={isDefault ? undefined : () => { update(createDefaultAideAttachedContextSettings()); flush(); }}
      resetLabel={t('settings.aideDialog.context.reset')}
      descriptionPosition="hidden"
    >
      {/* The settings set the height; the preview takes a narrower column beside them and scrolls within it. */}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,36%)] items-stretch gap-5 pr-5 max-[1080px]:grid-cols-1 max-[1080px]:pl-5">
        <SettingsSection
          ariaLabel={t('settings.aideDialog.context.section')}
          className="min-w-0 min-[1080px]:mb-0 min-[1080px]:[&_[data-settings-row]]:!items-center min-[1080px]:[&_[data-settings-row]]:!py-1.5"
          description={t('settings.aideDialog.context.description')}
          title={t('settings.aideDialog.context.section')}
        >
          <SettingsAideAttachedContextSection
            activeKey={active?.key ?? null}
            onActiveChange={setActive}
            onChange={update}
            onCommit={flush}
            settings={settings}
          />
          {saveFailed ? (
            <p className="mx-settings-panel-x mt-2 text-ui-sm text-destructive" role="alert">{t('settings.aideDialog.context.saveFailed')}</p>
          ) : null}
        </SettingsSection>
        <SettingsAideAttachedContextPreview active={active} settings={settings} />
      </div>
      <p className="mx-settings-panel-x mt-6 max-w-[520px] border-t border-settings-divider/70 pt-3 text-ui-sm leading-5 text-foreground/55">
        {t('settings.aideDialog.context.note')}
      </p>
    </AideSettingsPaneFrame>
  );
}
