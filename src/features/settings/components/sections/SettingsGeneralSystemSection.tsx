import { useEffect, useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  loadLoginItemSettingsFromRuntime,
  saveLoginItemSettingsToRuntime,
  type RuntimeLoginItemSettingsState
} from '../../../../shared/platform/loginItemSettings';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsSwitchClassName,
  settingsSwitchKnobClassName
} from '../../../../shared/ui';
import { settingsSearchRowProps } from '../../model/settingsSearch';
import { useLocalizedSettingsSearchRow } from '../useLocalizedSettingsSearchRows';

type Translate = ReturnType<typeof useTranslation>;

function getOpenAtLoginDescription(state: RuntimeLoginItemSettingsState | null, t: Translate) {
  if (state && !state.supported) {
    return t('settings.general.openAtLogin.unsupported');
  }
  if (state?.status === 'requires-approval') {
    return t('settings.general.openAtLogin.requiresApproval');
  }
  if (state?.status === 'error') {
    return t('settings.general.openAtLogin.error');
  }
  if (state?.status === 'system-disabled') {
    return t('settings.general.openAtLogin.ineffective');
  }
  return t('settings.general.openAtLogin.description');
}

function OpenAtLoginRow(props: {
  isPreview?: boolean;
  setState: (state: RuntimeLoginItemSettingsState) => void;
  state: RuntimeLoginItemSettingsState;
}) {
  const t = useTranslation();
  const openAtLoginRow = useLocalizedSettingsSearchRow('general-open-at-login');
  const [isUpdating, setIsUpdating] = useState(false);

  const updateEnabled = async (nextEnabled: boolean) => {
    if (props.isPreview) {
      props.setState({
        ...props.state,
        enabled: nextEnabled,
        effective: nextEnabled,
        status: nextEnabled ? 'enabled' : 'disabled'
      });
      return;
    }
    setIsUpdating(true);
    try {
      props.setState(await saveLoginItemSettingsToRuntime(nextEnabled));
    } finally {
      setIsUpdating(false);
    }
  };

  const enabled = props.state.enabled === true;

  return (
    <SettingsRow
      description={getOpenAtLoginDescription(props.state, t)}
      {...settingsSearchRowProps(openAtLoginRow)}
      title={openAtLoginRow.title}
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <button
          aria-checked={enabled}
          aria-label={t('settings.general.openAtLogin.aria')}
          className={settingsSwitchClassName(enabled)}
          disabled={isUpdating || !props.state.supported}
          onClick={() => void updateEnabled(!enabled)}
          role="switch"
          type="button"
        >
          <span aria-hidden="true" className={settingsSwitchKnobClassName(enabled)} />
        </button>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function SettingsGeneralSystemSection({ previewDesktopSettings = false }: {
  previewDesktopSettings?: boolean;
}) {
  const t = useTranslation();
  const [state, setState] = useState<RuntimeLoginItemSettingsState | null>(
    previewDesktopSettings ? { effective: false, enabled: false, status: 'disabled', supported: true } : null
  );

  useEffect(() => {
    if (previewDesktopSettings) {
      return undefined;
    }
    let active = true;
    void loadLoginItemSettingsFromRuntime().then((nextState) => {
      if (active) setState(nextState);
    });
    return () => {
      active = false;
    };
  }, [previewDesktopSettings]);

  if (!state) {
    return null;
  }

  return (
    <SettingsSection ariaLabel={t('settings.general.system.aria')} title={t('settings.general.system.section')}>
      <OpenAtLoginRow isPreview={previewDesktopSettings} setState={setState} state={state} />
    </SettingsSection>
  );
}
