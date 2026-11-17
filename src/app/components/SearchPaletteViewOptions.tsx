import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppSwitch } from '../../shared/ui';

import { PANEL_FONT_SIZE_MAX, PANEL_FONT_SIZE_MIN } from './panelViewFontSize';
import { PanelViewOptions, PanelViewStepper } from './PanelViewOptions';
import type { SearchPaletteView } from './searchPaletteViewPreference';

export function SearchPaletteViewOptions({ view, onChange }: {
  view: SearchPaletteView;
  onChange: (view: SearchPaletteView) => void;
}) {
  const t = useTranslation();
  const timestampLabel = t('desktop.search.showTimestamp');
  return (
    <PanelViewOptions label={t('desktop.search.viewOptions')}>
      <div className="flex items-center justify-between gap-3 text-xs font-medium text-[color:var(--role-floating-text-primary)]">
        <span>{timestampLabel}</span>
        <AppSwitch aria-label={timestampLabel} checked={view.showTimestamp} compact
          onCheckedChange={showTimestamp => onChange({ ...view, showTimestamp })} />
      </div>
      <PanelViewStepper label={t('desktop.search.previewLines')}
        decreaseLabel={t('desktop.search.previewLinesDecrease')} increaseLabel={t('desktop.search.previewLinesIncrease')}
        value={view.lines} min={1} max={3} onChange={lines => {
          if (lines === 1 || lines === 2 || lines === 3) onChange({ ...view, lines });
        }} />
      <PanelViewStepper label={t('desktop.search.titleFontSize')}
        decreaseLabel={t('desktop.search.titleFontSizeDecrease')} increaseLabel={t('desktop.search.titleFontSizeIncrease')}
        value={view.titleFontSize} min={PANEL_FONT_SIZE_MIN} max={PANEL_FONT_SIZE_MAX}
        onChange={titleFontSize => onChange({ ...view, titleFontSize })} />
      <PanelViewStepper label={t('desktop.search.previewFontSize')}
        decreaseLabel={t('desktop.search.previewFontSizeDecrease')} increaseLabel={t('desktop.search.previewFontSizeIncrease')}
        value={view.previewFontSize} min={PANEL_FONT_SIZE_MIN} max={PANEL_FONT_SIZE_MAX}
        onChange={previewFontSize => onChange({ ...view, previewFontSize })} />
      <PanelViewStepper label={t('desktop.search.metadataFontSize')}
        decreaseLabel={t('desktop.search.metadataFontSizeDecrease')} increaseLabel={t('desktop.search.metadataFontSizeIncrease')}
        value={view.metadataFontSize} min={PANEL_FONT_SIZE_MIN} max={PANEL_FONT_SIZE_MAX}
        onChange={metadataFontSize => onChange({ ...view, metadataFontSize })} />
    </PanelViewOptions>
  );
}
