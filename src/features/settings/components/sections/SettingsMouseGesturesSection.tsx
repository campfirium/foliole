import { useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsSwitchClassName,
  settingsSwitchKnobClassName
} from '../../../../shared/ui';
import { useMouseGestureSettings } from '../../context/MouseGestureSettingsProvider';

import { MouseGestureDisplayRows } from './SettingsMouseGestureAdvancedSections';
import { SettingsMouseGestureBindings } from './SettingsMouseGestureBindings';

export function SettingsMouseGesturesSection() {
  const t = useTranslation();
  const { settings, setEnabled } = useMouseGestureSettings();
  const [displayExpanded, setDisplayExpanded] = useState(false);

  return (
    <>
      <SettingsSection>
        <SettingsRow
          description={t('settings.mouseGestures.enabled.description')}
          title={t('settings.mouseGestures.enabled.title')}
        >
          <SettingsControlSlot>
            <button
              aria-checked={settings.enabled}
              aria-label={t('settings.mouseGestures.enabled.title')}
              className={settingsSwitchClassName(settings.enabled)}
              onClick={() => setEnabled(!settings.enabled)}
              role="switch"
              type="button"
            >
              <span className={settingsSwitchKnobClassName(settings.enabled)} />
            </button>
          </SettingsControlSlot>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection
        expanded={displayExpanded}
        onExpandedChange={setDisplayExpanded}
        title={t('settings.mouseGestures.display.title')}
      >
        <MouseGestureDisplayRows />
      </SettingsSection>
      <SettingsMouseGestureBindings />
    </>
  );
}
