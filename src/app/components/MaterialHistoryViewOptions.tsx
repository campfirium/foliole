import { Minus, Plus } from 'lucide-react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppIconButton } from '../../shared/ui';

import { HISTORY_FONT_SIZE_MAX, HISTORY_FONT_SIZE_MIN, type MaterialHistoryView } from './materialHistoryViewPreference';
import { PanelViewChoiceGroup, PanelViewOptions } from './PanelViewOptions';

export function MaterialHistoryViewOptions({ view, onChange }: {
  view: MaterialHistoryView;
  onChange: (view: MaterialHistoryView) => void;
}) {
  const t = useTranslation();
  return (
    <PanelViewOptions label={t('desktop.history.viewOptions')}>
      <PanelViewChoiceGroup label={t('desktop.history.displayOrder')} value={view.first}
        choices={([
          { value: 'preview', label: t('desktop.history.previewFirst') },
          { value: 'breadcrumb', label: t('desktop.history.breadcrumbFirst') }
        ] as const)} onChange={first => onChange({ ...view, first })} />
      <HistoryViewStepper label={t('desktop.history.previewLines')}
        decreaseLabel={t('desktop.history.previewLinesDecrease')} increaseLabel={t('desktop.history.previewLinesIncrease')}
        value={view.lines} min={1} max={3} onChange={lines => {
          if (lines === 1 || lines === 2 || lines === 3) onChange({ ...view, lines });
        }} />
      <HistoryViewStepper label={t('desktop.history.fontSize')}
        decreaseLabel={t('desktop.history.fontSizeDecrease')} increaseLabel={t('desktop.history.fontSizeIncrease')}
        value={view.fontSize} min={HISTORY_FONT_SIZE_MIN} max={HISTORY_FONT_SIZE_MAX}
        onChange={fontSize => onChange({ ...view, fontSize })} />
    </PanelViewOptions>
  );
}

function HistoryViewStepper(props: {
  label: string;
  decreaseLabel: string;
  increaseLabel: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3" role="group" aria-label={props.label}>
      <span className="text-xs font-medium text-foreground/75">{props.label}</span>
      <div className="flex items-center gap-0.5 rounded-lg border border-[var(--app-floating-divider-color)] bg-[var(--app-surface-control-bg)] p-0.5">
        <AppIconButton className="size-7" disabled={props.value <= props.min}
          icon={<Minus aria-hidden="true" className="size-4" />} label={props.decreaseLabel}
          onClick={() => props.onChange(props.value - 1)} />
        <output className="w-6 text-center text-ui-base tabular-nums text-foreground">{props.value}</output>
        <AppIconButton className="size-7" disabled={props.value >= props.max}
          icon={<Plus aria-hidden="true" className="size-4" />} label={props.increaseLabel}
          onClick={() => props.onChange(props.value + 1)} />
      </div>
    </div>
  );
}
