import { CompanionReadingCustomFonts } from './CompanionReadingCustomFonts';
import { CompanionReadingNumberControl } from './CompanionReadingNumberControl';
import { CompanionReadingSystemFonts } from './CompanionReadingSystemFonts';
import type {
  CompanionReadingTypographySettings,
  CompanionReadingFontFamily,
  CompanionReadingContrast
} from './companionReadingTypographySettings';
import {
  readingFontSize, readingLineHeight, READING_FONT_SIZE_MIN, READING_FONT_SIZE_MAX,
  READING_LINE_HEIGHT_MIN, READING_LINE_HEIGHT_MAX, READING_LINE_HEIGHT_STEP
} from './companionReadingTypographySettings';

import { useTranslation } from '@/shared/localization/LocalizationProvider';

type TypographySettingKey = keyof CompanionReadingTypographySettings;

const FONT_FAMILY_OPTIONS: readonly CompanionReadingFontFamily[] = ['sans', 'serif'];
const CONTRAST_OPTIONS: readonly CompanionReadingContrast[] = ['default', 'high'];

function ReadingTypographyOptionGroup<T extends TypographySettingKey>(props: {
  label: string;
  onChange(settings: CompanionReadingTypographySettings): void;
  options: readonly CompanionReadingTypographySettings[T][];
  settingKey: T;
  settings: CompanionReadingTypographySettings;
  valueLabel(value: CompanionReadingTypographySettings[T]): string;
}) {
  return (
    <fieldset className="border-b border-companion-divider py-4">
      <legend className="mb-3 text-xs font-semibold uppercase text-companion-text-tertiary">{props.label}</legend>
      <div className="grid grid-cols-2 gap-2">
        {props.options.map((option) => {
          const isSelected = props.settings[props.settingKey] === option;
          return (
            <button
              aria-pressed={isSelected}
              className={`min-h-10 rounded-md border px-3 text-sm font-medium transition ${
                isSelected
                  ? 'border-companion-accent bg-companion-accent-soft text-companion-accent'
                  : 'border-companion-divider text-foreground active:bg-companion-subtle/80'
              }`}
              key={option}
              onClick={() => props.onChange({ ...props.settings, [props.settingKey]: option })}
              type="button"
            >
              {props.valueLabel(option)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function CompanionReadingTypographyControls(props: {
  onChange(settings: CompanionReadingTypographySettings): void;
  settings: CompanionReadingTypographySettings;
}) {
  const t = useTranslation();
  return (
    <div className="border-t border-companion-divider">
      <CompanionReadingNumberControl
        label={t('companion.reading.font.size')}
        onChange={(fontSize) => props.onChange({ ...props.settings, fontSize })}
        value={readingFontSize(props.settings.fontSize)}
        min={READING_FONT_SIZE_MIN} max={READING_FONT_SIZE_MAX} step={1} unit="px"
      />
      <CompanionReadingNumberControl
        label={t('companion.reading.font.lineHeight')}
        onChange={(lineHeight) => props.onChange({ ...props.settings, lineHeight })}
        value={readingLineHeight(props.settings.lineHeight)}
        min={READING_LINE_HEIGHT_MIN} max={READING_LINE_HEIGHT_MAX} step={READING_LINE_HEIGHT_STEP}
      />
      <ReadingTypographyOptionGroup
        label={t('companion.reading.font.family')}
        onChange={props.onChange}
        options={FONT_FAMILY_OPTIONS}
        settingKey="fontFamily"
        settings={props.settings}
        valueLabel={(value) => value === 'sans' || value === 'serif'
          ? t(`companion.reading.font.family.${value}`)
          : value}
      />
      <CompanionReadingSystemFonts onChange={props.onChange} settings={props.settings} />
      <CompanionReadingCustomFonts onChange={props.onChange} settings={props.settings} />
      <ReadingTypographyOptionGroup
        label={t('companion.reading.font.contrast')}
        onChange={props.onChange}
        options={CONTRAST_OPTIONS}
        settingKey="contrast"
        settings={props.settings}
        valueLabel={(value) => t(`companion.reading.font.contrast.${value}`)}
      />
    </div>
  );
}
