import { useTranslation } from '@/shared/localization/LocalizationProvider';
import {
  SettingsControlSlot,
  SettingsRow,
  SETTINGS_RANGE_WIDTH_CLASS_NAME,
  SETTINGS_VALUE_WIDTH_CLASS_NAME,
  settingsControlValueClassName,
  settingsRangeClassName
} from '@/shared/ui';

export function ReviewRetentionRow({ own, inherited, onChange }: {
  own: number | null;
  inherited: number;
  onChange: (value: number | null) => void;
}) {
  const t = useTranslation();
  const inherits = own === null;
  const percent = Math.round((own ?? inherited) * 100);
  const label = t('desktop.nodeReview.desiredRetention');
  return (
    <SettingsRow title={inherits ? t('desktop.nodeReview.desiredRetention.inherited', { label }) : label}>
      <SettingsControlSlot>
        {!inherits && (
          <button className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => onChange(null)} type="button">
            {t('desktop.nodeReview.desiredRetention.useInherited')}
          </button>
        )}
        <input aria-label={t('desktop.nodeReview.desiredRetention.aria')} aria-valuetext={`${percent}%`}
          className={settingsRangeClassName(SETTINGS_RANGE_WIDTH_CLASS_NAME)} min={1} max={99} step={1}
          onChange={event => onChange(event.currentTarget.valueAsNumber / 100)}
          type="range" value={percent} />
        <span className={settingsControlValueClassName(SETTINGS_VALUE_WIDTH_CLASS_NAME)}>{percent}%</span>
      </SettingsControlSlot>
    </SettingsRow>
  );
}
