import { RotateCcw } from 'lucide-react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME, SETTINGS_COMPOUND_CONTROL_WIDTH_CLASS_NAME, SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME, SETTINGS_RANGE_WIDTH_CLASS_NAME, SETTINGS_VALUE_WIDTH_CLASS_NAME, SettingsControlSlot, SettingsRow, SettingsSection, settingsControlValueClassName, settingsFieldClassName, settingsRangeClassName, settingsResetButtonClassName } from '../../../../shared/ui';
import { MAX_NAVIGATION_META_FONT_SIZE, MAX_NAVIGATION_TITLE_FONT_SIZE, MIN_NAVIGATION_META_FONT_SIZE, MIN_NAVIGATION_TITLE_FONT_SIZE } from '../../../nodes/components/navigationTypographySettings';
import { DEFAULT_NODE_LIST_ROW_SPACING } from '../../../nodes/components/nodeListRowSpacingSettings';
import { useAppearanceSettings } from '../../context/AppearanceSettingsProvider';

function FontSizeRow(props: { ariaLabel: string; description: string; max: number; min: number; onChange: (value: number) => void; onReset: () => void; resetLabel: string; title: string; value: number }) {
  return (
    <SettingsRow description={props.description} title={props.title}>
      <SettingsControlSlot className={SETTINGS_COMPOUND_CONTROL_WIDTH_CLASS_NAME}>
        <button aria-label={props.resetLabel} className={settingsResetButtonClassName()} onClick={props.onReset} type="button"><RotateCcw aria-hidden="true" size={18} /></button>
        <input aria-label={props.ariaLabel} className={settingsRangeClassName(SETTINGS_RANGE_WIDTH_CLASS_NAME)} max={props.max} min={props.min} onChange={(event) => props.onChange(Number(event.target.value))} step={1} type="range" value={props.value} />
        <span className={settingsControlValueClassName(SETTINGS_VALUE_WIDTH_CLASS_NAME)}>{props.value}px</span>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function NodeListRowSpacingSection() {
  const t = useTranslation();
  const appearance = useAppearanceSettings();
  return (
    <SettingsSection ariaLabel={t('settings.appearance.topicList.sectionAria')} title={t('settings.appearance.topicList.section')}>
      <div data-settings-search-row-id="typography-navigation-title-size"><FontSizeRow ariaLabel={t('settings.typography.navigation.titleSize.aria')} description={t('settings.typography.navigation.titleSize.description')} max={MAX_NAVIGATION_TITLE_FONT_SIZE} min={MIN_NAVIGATION_TITLE_FONT_SIZE} onChange={appearance.setNavigationTitleFontSize} onReset={appearance.resetNavigationTitleFontSize} resetLabel={t('settings.typography.navigation.titleSize.reset')} title={t('settings.typography.navigation.titleSize.title')} value={appearance.navigationTitleFontSize} /></div>
      <div data-settings-search-row-id="typography-navigation-meta-size"><FontSizeRow ariaLabel={t('settings.typography.navigation.metaSize.aria')} description={t('settings.typography.navigation.metaSize.description')} max={MAX_NAVIGATION_META_FONT_SIZE} min={MIN_NAVIGATION_META_FONT_SIZE} onChange={appearance.setNavigationMetaFontSize} onReset={appearance.resetNavigationMetaFontSize} resetLabel={t('settings.typography.navigation.metaSize.reset')} title={t('settings.typography.navigation.metaSize.title')} value={appearance.navigationMetaFontSize} /></div>
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
