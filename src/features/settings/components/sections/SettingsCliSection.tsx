import { useEffect, useState } from 'react';

import type { NativeFolioleCliInstallState } from '../../../../../lib/platform/nativeUtilityCommandMap';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { runFolioleCliInstallationAction } from '../../../../shared/platform/folioleCliInstallation';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsButton,
  SettingsControlSlot,
  SettingsRow
} from '../../../../shared/ui';
import { SETTINGS_CLI_SEARCH_ROW_ID } from '../../model/settingsSearchRowCatalog';
import { useLocalizedSettingsSearchRow } from '../useLocalizedSettingsSearchRows';

function actionFor(status: NativeFolioleCliInstallState['status']) {
  if (status === 'installed') return 'remove' as const;
  if (status === 'repair_required') return 'repair' as const;
  return 'install' as const;
}

export function SettingsCliSection() {
  const t = useTranslation();
  const row = useLocalizedSettingsSearchRow(SETTINGS_CLI_SEARCH_ROW_ID);
  const [state, setState] = useState<NativeFolioleCliInstallState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void runFolioleCliInstallationAction('status').then(setState);
  }, []);

  if (!state) return null;
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
    <SettingsRow
      description={<><span className="block">{row.description}</span><span className="mt-1 block text-foreground/70">{t(feedbackKey)}</span></>}
      title={row.title}
    >
      {state.packageManaged || state.status === 'unavailable' ? null : <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <SettingsButton
          disabled={state.status === 'conflict'}
          loading={busy}
          loadingLabel={t('settings.about.cli.working')}
          onClick={() => void run()}
        >
          {t(`settings.about.cli.action.${action}`)}
        </SettingsButton>
      </SettingsControlSlot>}
    </SettingsRow>
  );
}
