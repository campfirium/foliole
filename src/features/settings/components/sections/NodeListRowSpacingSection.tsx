import { RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME, SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME, SettingsControlSlot, SettingsRow, SettingsSection, settingsFieldClassName, settingsResetButtonClassName } from '../../../../shared/ui';
import {
  DEFAULT_NODE_LIST_ROW_SPACING,
  getNodeListRowSpacing,
  setNodeListRowSpacing
} from '../../../nodes/components/nodeListRowSpacingSettings';

export function NodeListRowSpacingSection() {
  const t = useTranslation();
  const [rowSpacing, setRowSpacing] = useState(() => getNodeListRowSpacing());
  const resetRowSpacing = () => {
    setRowSpacing(DEFAULT_NODE_LIST_ROW_SPACING);
    setNodeListRowSpacing(DEFAULT_NODE_LIST_ROW_SPACING);
  };

  return (
    <SettingsSection ariaLabel={t('settings.appearance.topicList.sectionAria')} title={t('settings.appearance.topicList.section')}>
      <SettingsRow
        description={t('settings.appearance.topicList.rowSpacing.description', { defaultValue: DEFAULT_NODE_LIST_ROW_SPACING })}
        title={t('settings.appearance.topicList.rowSpacing.title')}
      >
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <button
            aria-label={t('settings.appearance.topicList.rowSpacing.reset')}
            className={settingsResetButtonClassName('disabled:cursor-default disabled:opacity-45')}
            disabled={rowSpacing === DEFAULT_NODE_LIST_ROW_SPACING}
            onClick={resetRowSpacing}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={18} strokeWidth={1.9} />
          </button>
          <label className="inline-flex items-center gap-2">
            <span className="sr-only">{t('settings.appearance.topicList.rowSpacing.aria')}</span>
            <input
              aria-label={t('settings.appearance.topicList.rowSpacing.aria')}
              className={settingsFieldClassName(SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME)}
              min={0}
              onChange={(event) => {
                const nextValue = Number(event.target.value);
                setRowSpacing(nextValue);
                setNodeListRowSpacing(nextValue);
              }}
              step={1}
              type="number"
              value={rowSpacing}
            />
            <span className="text-sm text-foreground/65">px</span>
          </label>
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}
