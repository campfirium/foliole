import { useEffect, useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { loadSearchAliasFileStatus, openSearchAliasFile } from '../../../../shared/platform/desktop/searchAliasFile';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  settingsButtonClassName
} from '../../../../shared/ui';

export function SettingsSearchAliasRow({ preview }: { preview: boolean }) {
  const t = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (preview) return;
    let active = true;
    void loadSearchAliasFileStatus().then((status) => {
      if (active) setError(status.error);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => { active = false; };
  }, [preview]);

  const openFile = async () => {
    setOpening(true);
    try {
      const status = await openSearchAliasFile();
      setError(status.error);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setOpening(false);
    }
  };

  return (
    <SettingsRow
      data-settings-search-row-id="general-search-aliases"
      description={<>{t('settings.general.searchAliases.description')}{error ? <span className="mt-1 block text-destructive">{error}</span> : null}</>}
      title={t('settings.general.searchAliases.title')}
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <button className={settingsButtonClassName()} disabled={opening || preview} onClick={() => void openFile()} type="button">
          {t('settings.general.searchAliases.openFile')}
        </button>
      </SettingsControlSlot>
    </SettingsRow>
  );
}
