import { useEffect, useState } from 'react';

import { MONOSPACE_PRESET_OPTION_VALUES, monospacePresetLabel } from '../features/settings/model/settingsPanelOptions';
import { listAvailableSystemFonts } from '../features/settings/model/systemFonts';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { settingsFieldClassName } from '../shared/ui';

import { normalizeMonospaceFont } from './companionReadingMonospace';
import type { CompanionReadingTypographySettings } from './companionReadingTypographySettings';

export function CompanionReadingMonospaceControl(props: {
  onChange(settings: CompanionReadingTypographySettings): void;
  settings: CompanionReadingTypographySettings;
}) {
  const t = useTranslation();
  const [fonts, setFonts] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    void listAvailableSystemFonts().then(catalog => {
      if (active) setFonts(catalog.monospaceFonts.filter(font => normalizeMonospaceFont(`system:${font}`)));
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const selected = props.settings.monospaceFont ?? 'default';
  const deviceFonts = [...new Set([...fonts, ...(selected.startsWith('system:') ? [selected.slice(7)] : [])])];
  return <label className="block border-b border-companion-divider py-4 text-sm text-foreground">
    <span className="mb-3 block">{t('settings.appearance.monospaceFont.title')}</span>
    <select aria-label={t('settings.appearance.monospaceFont.title')}
      className={settingsFieldClassName('min-h-11 w-full')} value={selected}
      onChange={event => {
        const settings = { ...props.settings };
        delete settings.monospaceFont;
        const next = normalizeMonospaceFont(event.target.value);
        props.onChange(next ? { ...settings, monospaceFont: next } : settings);
      }}>
      {MONOSPACE_PRESET_OPTION_VALUES.map(preset => <option key={preset} value={preset}>{monospacePresetLabel(preset, t)}</option>)}
      {deviceFonts.map(font => <option key={font} value={`system:${font}`}>{font}</option>)}
    </select>
  </label>;
}
