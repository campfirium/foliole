import { useEffect, useState } from 'react';

import { AGENT_CONTROL_LEARNING_IMPORT_KEY } from '../../../../../lib/platform/agentControlLearningImport';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { loadRuntimeAppSettingsState, saveRuntimeAppSettingsState } from '../../../../shared/platform/appSettingsState';
import { isDesktopRuntime } from '../../../../shared/platform/runtime';
import { SettingsControlSlot, SettingsRow, SettingsSection } from '../../../../shared/ui';
import { settingsSwitchClassName, settingsSwitchKnobClassName } from '../../../../shared/ui';

export function SettingsAgentControlSection() {
  const t = useTranslation();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void loadRuntimeAppSettingsState().then((settings) => {
      if (!active) return;
      if (settings) setEnabled(settings[AGENT_CONTROL_LEARNING_IMPORT_KEY] === 'true');
      else setFailed(true);
    });
    return () => { active = false; };
  }, []);

  if (!isDesktopRuntime()) return null;
  const title = t('settings.general.agentControl.learningImport');
  return (
    <SettingsSection ariaLabel="Agent Control" title="Agent Control">
      <SettingsRow title={title} description={t('settings.general.agentControl.learningImportDescription')}>
        <SettingsControlSlot>
          <button aria-checked={enabled === true} aria-label={title} className={settingsSwitchClassName(enabled === true)}
            disabled={enabled === null || saving} onClick={() => void toggle()} role="switch" type="button">
            <span aria-hidden="true" className={settingsSwitchKnobClassName(enabled === true)} />
          </button>
        </SettingsControlSlot>
      </SettingsRow>
      {failed ? <p className="text-destructive" role="alert">{t('settings.general.agentControl.learningImportError')}</p> : null}
    </SettingsSection>
  );

  async function toggle() {
    const next = !enabled;
    setSaving(true);
    setFailed(false);
    const saved = await saveRuntimeAppSettingsState({ [AGENT_CONTROL_LEARNING_IMPORT_KEY]: String(next) });
    if (saved) setEnabled(next);
    else setFailed(true);
    setSaving(false);
  }
}
