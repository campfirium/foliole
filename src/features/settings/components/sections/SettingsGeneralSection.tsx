import { useEffect, useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  isSearchEnhancementEnabled,
  updateSearchEnhancementEnabled
} from '../../../../shared/platform/searchEnhancementSettings';
import {
  loadSearchIndexRebuildStatus,
  onSearchIndexRebuildStatus,
  type SearchIndexRebuildStatus
} from '../../../../shared/platform/searchIndexRebuildStatus';
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

function getSearchEnhancementStatusCopy(status: SearchIndexRebuildStatus | null, error: string | null, t: Translate) {
  if (error) return error;
  if (!status) return null;
  if (status.status === 'rebuilding') return t('settings.general.searchEnhancement.preparing');
  if (status.status === 'failed') {
    return status.strategy === 'cjk-trigram'
      ? t('settings.general.searchEnhancement.enableFailed')
      : t('settings.general.searchEnhancement.disableFailed');
  }
  return status.strategy === 'cjk-trigram'
    ? t('settings.general.searchEnhancement.enhancedReady')
    : t('settings.general.searchEnhancement.ready');
}

function SearchEnhancementDescription(props: { statusCopy: string | null }) {
  const t = useTranslation();
  return (
    <>
      <span className="block">
        {t('settings.general.searchEnhancement.description')}
      </span>
      {props.statusCopy ? <span className="mt-1 block text-foreground/70">{props.statusCopy}</span> : null}
    </>
  );
}

function SearchEnhancementRow() {
  const t = useTranslation();
  const searchEnhancementRow = useLocalizedSettingsSearchRow('general-search-enhancement');
  const [enabled, setEnabled] = useState(isSearchEnhancementEnabled);
  const [status, setStatus] = useState<SearchIndexRebuildStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    let active = true;
    void loadSearchIndexRebuildStatus().then((nextStatus) => {
      if (active) setStatus(nextStatus);
    });
    const unsubscribe = onSearchIndexRebuildStatus((nextStatus) => {
      setStatus(nextStatus);
      setError(null);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const updateEnabled = async (nextEnabled: boolean) => {
    setIsUpdating(true);
    setError(null);
    try {
      const nextStatus = await updateSearchEnhancementEnabled(nextEnabled);
      setEnabled(nextEnabled);
      setStatus(nextStatus);
    } catch {
      setEnabled(isSearchEnhancementEnabled());
      setError(nextEnabled ? t('settings.general.searchEnhancement.enableFailed') : t('settings.general.searchEnhancement.disableFailed'));
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <SettingsRow
      description={<SearchEnhancementDescription statusCopy={getSearchEnhancementStatusCopy(status, error, t)} />}
      {...settingsSearchRowProps(searchEnhancementRow)}
      title={searchEnhancementRow.title}
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <button
          aria-checked={enabled}
          aria-label={t('settings.general.searchEnhancement.aria')}
          className={settingsSwitchClassName(enabled)}
          disabled={isUpdating}
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

export function SettingsGeneralSection() {
  const t = useTranslation();
  return (
    <SettingsSection ariaLabel={t('settings.general.search.aria')} title={t('settings.general.search.section')}>
      <SearchEnhancementRow />
    </SettingsSection>
  );
}
