import { useTranslation } from '../../shared/localization/LocalizationProvider';

import type { MaterialHistoryView } from './materialHistoryViewPreference';
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
      <PanelViewChoiceGroup label={t('desktop.history.fontSize')} value={view.fontSize}
        choices={([
          { value: 'small', label: t('desktop.history.fontSizeSmall') },
          { value: 'default', label: t('desktop.history.fontSizeDefault') },
          { value: 'large', label: t('desktop.history.fontSizeLarge') }
        ] as const)} onChange={fontSize => onChange({ ...view, fontSize })} />
    </PanelViewOptions>
  );
}
