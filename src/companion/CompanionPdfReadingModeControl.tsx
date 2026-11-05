import { PDF_READING_MODE_OPTIONS, type PdfReadingMode } from '../features/settings/model/appearanceSettingsOptions';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { settingsFieldClassName } from '../shared/ui';

import { useCompanionColorMode } from './CompanionColorModeProvider';

export function CompanionPdfReadingModeControl() {
  const colorMode = useCompanionColorMode();
  const t = useTranslation();
  if (!colorMode) return null;
  return <div className="mt-4 text-sm text-foreground">
    <label className="flex flex-col gap-2">
      <span>{t('settings.appearance.pdfDarkMode.title')}</span>
      <select className={settingsFieldClassName('min-h-11 w-full')}
        value={colorMode.pdfReadingMode}
        onChange={event => colorMode.updatePdfReadingMode(event.target.value as PdfReadingMode)}>
        {PDF_READING_MODE_OPTIONS.map(mode => <option key={mode} value={mode}>
          {t(`settings.appearance.pdfDarkMode.${mode}`)}
        </option>)}
      </select>
    </label>
    <p className="mt-2 text-xs text-companion-text-secondary">{t('settings.appearance.pdfDarkMode.description')}</p>
    {colorMode.pdfReadingModeSaveError ? <p className="mt-2 text-sm text-error" role="alert">{t('companion.reading.font.saveError')}</p> : null}
  </div>;
}
