import { useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  SettingsSection,
  settingsSwitchClassName,
  settingsSwitchKnobClassName
} from '../../../../shared/ui';
import { useMouseGestureSettings } from '../../context/MouseGestureSettingsProvider';

import { MouseGestureDisplayRows } from './SettingsMouseGestureAdvancedSections';
import { SettingsMouseGestureBindings } from './SettingsMouseGestureBindings';

export function SettingsMouseGesturesSection() {
  const t = useTranslation();
  const [displayExpanded, setDisplayExpanded] = useState(false);

  return (
    <>
      <SettingsSection
        disclosureIconPosition="end"
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

export function SettingsMouseGesturesHeaderControl() {
  const t = useTranslation();
  const { settings, setEnabled } = useMouseGestureSettings();
  return (
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
  );
}
