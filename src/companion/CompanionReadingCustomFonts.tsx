import { useEffect, useState } from 'react';

import {
  type CompanionReadingFont,
  importReadingFont,
  listReadingFonts,
  removeReadingFont
} from './companionReadingFonts';
import type { CompanionReadingTypographySettings } from './companionReadingTypographySettings';

import { useTranslation } from '@/shared/localization/LocalizationProvider';

interface CustomFontProps {
  onChange(settings: CompanionReadingTypographySettings): void;
  settings: CompanionReadingTypographySettings;
}

function useReadingCustomFonts(props: CustomFontProps) {
  const [fonts, setFonts] = useState<CompanionReadingFont[]>([]);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void listReadingFonts().then((items) => {
      if (active) setFonts(items);
    }).catch(() => {
      if (active) setError(true);
    });
    return () => { active = false; };
  }, []);

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(false);
    try {
      const font = await importReadingFont(file);
      setFonts((current) => [...current, font]);
      props.onChange({ ...props.settings, fontFamily: `custom:${font.id}` });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const removeFont = async (id: string) => {
    setError(false);
    try {
      await removeReadingFont(id);
      setFonts((current) => current.filter((font) => font.id !== id));
      if (props.settings.fontFamily === `custom:${id}`) {
        props.onChange({ ...props.settings, fontFamily: 'sans' });
      }
    } catch {
      setError(true);
    }
  };

  return { busy, error, fonts, importFile, removeFont };
}

export function CompanionReadingCustomFonts(props: CustomFontProps) {
  const t = useTranslation();
  const { busy, error, fonts, importFile, removeFont } = useReadingCustomFonts(props);

  return (
    <div className="border-b border-companion-divider pb-4">
      {fonts.map((font) => (
        <div className="flex items-center gap-2 py-1" key={font.id}>
          <button
            aria-pressed={props.settings.fontFamily === `custom:${font.id}`}
            className={`min-h-10 min-w-0 flex-1 truncate rounded-md border px-3 text-left text-sm ${
              props.settings.fontFamily === `custom:${font.id}`
                ? 'border-companion-accent bg-companion-accent-soft text-companion-accent'
                : 'border-companion-divider text-foreground'
            }`}
            onClick={() => props.onChange({ ...props.settings, fontFamily: `custom:${font.id}` })}
            type="button"
          >
            {font.name}
          </button>
          <button
            aria-label={`${t('companion.reading.font.remove')} ${font.name}`}
            className="min-h-10 rounded-md px-2 text-sm text-companion-text-secondary"
            onClick={() => void removeFont(font.id)}
            type="button"
          >
            {t('companion.reading.font.remove')}
          </button>
        </div>
      ))}
      <label className="mt-2 flex min-h-10 cursor-pointer items-center justify-center rounded-md border border-companion-divider px-3 text-sm font-medium text-foreground">
        {t('companion.reading.font.import')}
        <input
          accept=".ttf,.otf,font/ttf,font/otf"
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            void importFile(event.target.files?.[0]);
            event.target.value = '';
          }}
          type="file"
        />
      </label>
      {error ? <p className="pt-2 text-sm text-error" role="alert">{t('companion.reading.font.importError')}</p> : null}
    </div>
  );
}
