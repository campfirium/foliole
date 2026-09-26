import { useEffect, useState } from 'react';

import type { CompanionReadingTypographySettings } from './companionReadingTypographySettings';

import { listAvailableSystemFonts } from '@/features/settings/model/systemFonts';
import { useTranslation } from '@/shared/localization/LocalizationProvider';

export function CompanionReadingSystemFonts(props: {
  onChange(settings: CompanionReadingTypographySettings): void;
  settings: CompanionReadingTypographySettings;
}) {
  const t = useTranslation();
  const [fonts, setFonts] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    void listAvailableSystemFonts().then((catalog) => {
      if (active) setFonts(catalog.fonts.filter((font) => /^[\p{L}\p{N} ._-]{1,80}$/u.test(font)));
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  if (fonts.length === 0) return null;
  return (
    <div className="border-b border-companion-divider pb-4">
      <select
        aria-label={t('companion.reading.font.system')}
        className="min-h-10 w-full rounded-md border border-companion-divider bg-transparent px-3 text-sm text-foreground"
        onChange={(event) => {
          if (event.target.value) props.onChange({ ...props.settings, fontFamily: `system:${event.target.value}` });
        }}
        value={props.settings.fontFamily.startsWith('system:') ? props.settings.fontFamily.slice(7) : ''}
      >
        <option value="">{t('companion.reading.font.system')}</option>
        {fonts.map((font) => <option key={font} value={font}>{font}</option>)}
      </select>
    </div>
  );
}
