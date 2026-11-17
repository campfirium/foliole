import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppSwitch } from '../../shared/ui';

import { PanelViewChoiceGroup, PanelViewOptions, previewLineChoices } from './PanelViewOptions';
import type { SearchPaletteView } from './searchPaletteViewPreference';

export function SearchPaletteViewOptions({ view, onChange }: {
  view: SearchPaletteView;
  onChange: (view: SearchPaletteView) => void;
}) {
  const t = useTranslation();
  const timestampLabel = t('desktop.search.showTimestamp');
  return (
    <PanelViewOptions label={t('desktop.search.viewOptions')}>
      <PanelViewChoiceGroup label={t('desktop.search.previewLines')} value={view.lines}
        choices={previewLineChoices} onChange={lines => onChange({ ...view, lines })} />
      <div className="flex items-center justify-between gap-3 text-xs font-medium text-[color:var(--role-floating-text-primary)]">
        <span>{timestampLabel}</span>
        <AppSwitch aria-label={timestampLabel} checked={view.showTimestamp} compact
          onCheckedChange={showTimestamp => onChange({ ...view, showTimestamp })} />
      </div>
    </PanelViewOptions>
  );
}
