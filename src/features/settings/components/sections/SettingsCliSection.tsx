import { useEffect, useState } from 'react';

import type { NativeFolioleCliInstallState } from '../../../../../lib/platform/nativeUtilityCommandMap';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { runFolioleCliInstallationAction } from '../../../../shared/platform/folioleCliInstallation';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsButtonClassName
} from '../../../../shared/ui';
import { settingsSearchRowProps } from '../../model/settingsSearch';
import { useLocalizedSettingsSearchRow } from '../useLocalizedSettingsSearchRows';

function actionFor(status: NativeFolioleCliInstallState['status']) {
  if (status === 'installed') return 'remove' as const;
  if (status === 'repair_required') return 'repair' as const;
  return 'install' as const;
}

export function SettingsCliSection() {
  const t = useTranslation();
  const row = useLocalizedSettingsSearchRow('about-cli');
  const [state, setState] = useState<NativeFolioleCliInstallState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void runFolioleCliInstallationAction('status').then(setState);
  }, []);

  if (!state || state.status === 'unavailable') return null;
  const action = actionFor(state.status);
  const feedbackKey = state.error
    ? `settings.about.cli.error.${state.error}` as const
    : `settings.about.cli.status.${state.status}` as const;
  const run = async () => {
    setBusy(true);
    try {
      setState(await runFolioleCliInstallationAction(action));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection ariaLabel={t('settings.about.cli.aria')} title={t('settings.about.cli.section')}>
      <SettingsRow
        {...settingsSearchRowProps(row)}
        description={<><span className="block">{row.description}</span><span className="mt-1 block text-foreground/70">{t(feedbackKey)}</span></>}
        title={row.title}
      >
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <button
            className={settingsButtonClassName()}
            disabled={busy || state.status === 'conflict'}
            onClick={() => void run()}
            type="button"
          >
            {busy ? t('settings.about.cli.working') : t(`settings.about.cli.action.${action}`)}
          </button>
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}
