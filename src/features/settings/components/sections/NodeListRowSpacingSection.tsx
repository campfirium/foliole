import { RotateCcw } from 'lucide-react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME, SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME, SettingsControlSlot, SettingsRow, SettingsSection, settingsFieldClassName, settingsResetButtonClassName } from '../../../../shared/ui';
import { DEFAULT_NODE_LIST_ROW_SPACING } from '../../../nodes/components/nodeListRowSpacingSettings';
import { useAppearanceSettings } from '../../context/AppearanceSettingsProvider';

export function NodeListRowSpacingSection() {
  const t = useTranslation();
  const appearance = useAppearanceSettings();
  return (
    <SettingsSection ariaLabel={t('settings.appearance.topicList.sectionAria')} title={t('settings.appearance.topicList.section')}>
      <SettingsRow data-settings-search-row-id="typography-navigation-row-spacing" description={t('settings.appearance.topicList.rowSpacing.description', { defaultValue: DEFAULT_NODE_LIST_ROW_SPACING })} title={t('settings.appearance.topicList.rowSpacing.title')}>
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <button aria-label={t('settings.appearance.topicList.rowSpacing.reset')} className={settingsResetButtonClassName()} disabled={appearance.nodeListRowSpacing === DEFAULT_NODE_LIST_ROW_SPACING} onClick={appearance.resetNodeListRowSpacing} type="button"><RotateCcw aria-hidden="true" size={18} /></button>
          <label className="inline-flex items-center gap-2">
            <input aria-label={t('settings.appearance.topicList.rowSpacing.aria')} className={settingsFieldClassName(SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME)} max={24} min={0} onChange={(event) => appearance.setNodeListRowSpacing(Number(event.target.value))} step={1} type="number" value={appearance.nodeListRowSpacing} />
            <span className="text-sm text-foreground/65">px</span>
          </label>
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}
