import { useTranslation } from '../../shared/localization/LocalizationProvider';

import type { MaterialHistoryView } from './materialHistoryViewPreference';
import { PANEL_FONT_SIZE_MAX, PANEL_FONT_SIZE_MIN } from './panelViewFontSize';
import { PanelViewChoiceGroup, PanelViewOptions, PanelViewStepper } from './PanelViewOptions';

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
      <PanelViewStepper label={t('desktop.history.previewLines')}
        decreaseLabel={t('desktop.history.previewLinesDecrease')} increaseLabel={t('desktop.history.previewLinesIncrease')}
        value={view.lines} min={1} max={3} onChange={lines => {
          if (lines === 1 || lines === 2 || lines === 3) onChange({ ...view, lines });
        }} />
      <PanelViewStepper label={t('desktop.history.previewSize')}
        decreaseLabel={t('desktop.history.previewSizeDecrease')} increaseLabel={t('desktop.history.previewSizeIncrease')}
        value={view.previewSize} min={PANEL_FONT_SIZE_MIN} max={PANEL_FONT_SIZE_MAX}
        onChange={previewSize => onChange({ ...view, previewSize })} />
      <PanelViewStepper label={t('desktop.history.breadcrumbSize')}
        decreaseLabel={t('desktop.history.breadcrumbSizeDecrease')} increaseLabel={t('desktop.history.breadcrumbSizeIncrease')}
        value={view.breadcrumbSize} min={PANEL_FONT_SIZE_MIN} max={PANEL_FONT_SIZE_MAX}
        onChange={breadcrumbSize => onChange({ ...view, breadcrumbSize })} />
    </PanelViewOptions>
  );
}
