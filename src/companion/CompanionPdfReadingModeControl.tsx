import { PDF_READING_MODE_OPTIONS, type PdfReadingMode } from '../features/settings/model/appearanceSettingsOptions';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { SettingsSegmentedControl } from '../shared/ui/SettingsSegmentedControl';

import { useCompanionColorMode } from './CompanionColorModeProvider';

export function CompanionPdfReadingModeControl() {
  const colorMode = useCompanionColorMode();
  const t = useTranslation();
  if (!colorMode) return null;
  return <fieldset className="mt-4 text-sm text-foreground">
    <legend className="mb-2">{t('settings.appearance.pdfDarkMode.title')}</legend>
    <SettingsSegmentedControl variant="touch" ariaLabel={t('settings.appearance.pdfDarkMode.title')}
      value={colorMode.pdfReadingMode}
      onChange={mode => colorMode.updatePdfReadingMode(mode as PdfReadingMode)}
      options={PDF_READING_MODE_OPTIONS.map(mode => ({ label: t(`settings.appearance.pdfDarkMode.${mode}`), value: mode }))} />
    {colorMode.pdfReadingModeSaveError ? <p className="mt-2 text-sm text-error" role="alert">{t('companion.reading.font.saveError')}</p> : null}
  </fieldset>;
}
