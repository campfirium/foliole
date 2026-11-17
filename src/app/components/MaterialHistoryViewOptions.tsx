import { useId } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { settingsRangeClassName } from '../../shared/ui';

import { HISTORY_FONT_SIZE_MAX, HISTORY_FONT_SIZE_MIN, type MaterialHistoryView } from './materialHistoryViewPreference';
import { PanelViewChoiceGroup, PanelViewOptions, previewLineChoices } from './PanelViewOptions';

export function MaterialHistoryViewOptions({ view, onChange }: {
  view: MaterialHistoryView;
  onChange: (view: MaterialHistoryView) => void;
}) {
  const t = useTranslation();
  const fontSizeId = useId();
  return (
    <PanelViewOptions label={t('desktop.history.viewOptions')}>
      <PanelViewChoiceGroup label={t('desktop.history.displayOrder')} value={view.first}
        choices={([
          { value: 'preview', label: t('desktop.history.previewFirst') },
          { value: 'breadcrumb', label: t('desktop.history.breadcrumbFirst') }
        ] as const)} onChange={first => onChange({ ...view, first })} />
      <PanelViewChoiceGroup label={t('desktop.history.previewLines')} value={view.lines}
        choices={previewLineChoices} onChange={lines => onChange({ ...view, lines })} />
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground/75" htmlFor={fontSizeId}>{t('desktop.history.fontSize')}</label>
        <div className="flex items-center gap-3">
          <input className={settingsRangeClassName('min-w-0 flex-1')} id={fontSizeId}
            min={HISTORY_FONT_SIZE_MIN} max={HISTORY_FONT_SIZE_MAX} step={1} type="range" value={view.fontSize}
            onChange={event => onChange({ ...view, fontSize: event.currentTarget.valueAsNumber })} />
          <span className="w-5 text-right text-xs tabular-nums text-foreground/75">{view.fontSize}</span>
        </div>
      </div>
    </PanelViewOptions>
  );
}
