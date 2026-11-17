import { Minus, Plus } from 'lucide-react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppIconButton } from '../../shared/ui';

import { HISTORY_FONT_SIZE_MAX, HISTORY_FONT_SIZE_MIN, type MaterialHistoryView } from './materialHistoryViewPreference';
import { PanelViewChoiceGroup, PanelViewOptions, previewLineChoices } from './PanelViewOptions';

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
      <PanelViewChoiceGroup label={t('desktop.history.previewLines')} value={view.lines}
        choices={previewLineChoices} onChange={lines => onChange({ ...view, lines })} />
      <div className="flex items-center justify-between gap-3" role="group" aria-label={t('desktop.history.fontSize')}>
        <span className="text-xs font-medium text-foreground/75">{t('desktop.history.fontSize')}</span>
        <div className="flex items-center gap-0.5 rounded-lg border border-[var(--app-floating-divider-color)] bg-[var(--app-surface-control-bg)] p-0.5">
          <AppIconButton className="size-7" disabled={view.fontSize <= HISTORY_FONT_SIZE_MIN}
            icon={<Minus aria-hidden="true" className="size-4" />} label={t('desktop.history.fontSizeDecrease')}
            onClick={() => onChange({ ...view, fontSize: view.fontSize - 1 })} />
          <output className="w-6 text-center text-ui-base tabular-nums text-foreground">{view.fontSize}</output>
          <AppIconButton className="size-7" disabled={view.fontSize >= HISTORY_FONT_SIZE_MAX}
            icon={<Plus aria-hidden="true" className="size-4" />} label={t('desktop.history.fontSizeIncrease')}
            onClick={() => onChange({ ...view, fontSize: view.fontSize + 1 })} />
        </div>
      </div>
    </PanelViewOptions>
  );
}
