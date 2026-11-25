import { useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppSwitch, SettingsSection } from '../shared/ui';

import { updateCompanionToolbarAppearance, useCompanionToolbarAppearance } from './companionSelectionToolbarPreference';
import { CompanionSettingRow } from './CompanionSettingRow';

function PercentSlider(props: { label: string; value: number; disabled?: boolean; onChange(value: number): void }) {
  return <div className="flex min-h-11 items-center gap-3">
    <input aria-label={props.label} className="min-w-0 flex-1 accent-foreground disabled:opacity-40" disabled={props.disabled}
      max={100} min={0} step={1} type="range" value={props.value}
      onChange={event => props.onChange(event.currentTarget.valueAsNumber)} />
    <span className="w-12 text-right text-base tabular-nums text-companion-text-secondary">{props.value}%</span>
  </div>;
}

export function CompanionToolbarAppearanceControls() {
  const t = useTranslation();
  const appearance = useCompanionToolbarAppearance();
  const [saveError, setSaveError] = useState(false);
  const update = (patch: Parameters<typeof updateCompanionToolbarAppearance>[0]) => setSaveError(!updateCompanionToolbarAppearance(patch));
  const showLabel = t('settings.appearance.floatingToolbar.show');
  const opacityLabel = t('settings.appearance.floatingToolbar.opacity');
  return <SettingsSection ariaLabel={t('settings.appearance.floatingToolbar.title')} title={t('settings.appearance.floatingToolbar.title')}>
    <CompanionSettingRow title={showLabel} description={t('settings.appearance.floatingToolbar.description')}>
      <AppSwitch aria-label={showLabel} checked={appearance.selectionToolbarEnabled}
        onCheckedChange={selectionToolbarEnabled => update({ selectionToolbarEnabled })} />
    </CompanionSettingRow>
    <div className="border-b border-companion-divider py-3">
      <span className="text-ui-lg font-normal text-foreground">{opacityLabel}</span>
      <PercentSlider label={opacityLabel} value={appearance.selectionToolbarOpacityPercent}
        disabled={!appearance.selectionToolbarEnabled}
        onChange={selectionToolbarOpacityPercent => update({ selectionToolbarOpacityPercent })} />
    </div>
    {saveError ? <p className="py-3 text-sm text-error" role="alert">{t('companion.reading.font.saveError')}</p> : null}
  </SettingsSection>;
}

/** Lives with the reading colors, matching the desktop appearance layout. */
export function CompanionImageFocusTransparencyControl() {
  const t = useTranslation();
  const appearance = useCompanionToolbarAppearance();
  const [saveError, setSaveError] = useState(false);
  const label = t('settings.appearance.imageFocusTransparency.title');
  return <div className="border-b border-companion-divider py-3">
    <span className="text-ui-lg font-normal text-foreground">{label}</span>
    <p className="mt-1 text-sm leading-5 text-companion-text-secondary">{t('settings.appearance.imageFocusTransparency.description')}</p>
    <PercentSlider label={label} value={appearance.imageFocusTransparencyPercent}
      onChange={imageFocusTransparencyPercent => setSaveError(!updateCompanionToolbarAppearance({ imageFocusTransparencyPercent }))} />
    {saveError ? <p className="text-sm text-error" role="alert">{t('companion.reading.font.saveError')}</p> : null}
  </div>;
}
