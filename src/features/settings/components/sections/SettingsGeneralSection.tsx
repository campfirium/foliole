import { useEffect, useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { setActionHelpCardsEnabled, useActionHelpCardsEnabled } from '../../../../shared/platform/actionHelpCards';
import {
  getFullTextSearchIndexStrategy,
  updateFullTextSearchIndexStrategy,
  type FullTextSearchIndexStrategy
} from '../../../../shared/platform/searchEnhancementSettings';
import {
  loadSearchIndexRebuildStatus,
  onSearchIndexRebuildStatus,
  type SearchIndexRebuildStatus
} from '../../../../shared/platform/searchIndexRebuildStatus';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_SELECT_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsFieldClassName
} from '../../../../shared/ui';
import { settingsSwitchClassName, settingsSwitchKnobClassName } from '../../../../shared/ui';
import { settingsSearchRowProps } from '../../model/settingsSearch';
import { useLocalizedSettingsSearchRow } from '../useLocalizedSettingsSearchRows';

import { SettingsCaptureSection } from './SettingsCaptureSection';
import { SettingsGeneralSystemSection } from './SettingsGeneralSystemSection';

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

function isFullTextSearchIndexStrategy(value: string): value is FullTextSearchIndexStrategy {
  return value === 'word-based' || value === 'cjk-trigram';
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
  const [strategy, setStrategy] = useState(getFullTextSearchIndexStrategy);
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

  const updateStrategy = async (nextStrategy: FullTextSearchIndexStrategy) => {
    setIsUpdating(true);
    setError(null);
    try {
      const nextStatus = await updateFullTextSearchIndexStrategy(nextStrategy);
      setStrategy(nextStrategy);
      setStatus(nextStatus);
    } catch {
      setStrategy(getFullTextSearchIndexStrategy());
      setError(t('settings.general.searchEnhancement.enableFailed'));
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
        <select
          aria-label={t('settings.general.searchEnhancement.aria')}
          className={settingsFieldClassName(SETTINGS_SELECT_WIDTH_CLASS_NAME)}
          disabled={isUpdating}
          onChange={(event) => {
            const nextStrategy = event.target.value;
            if (isFullTextSearchIndexStrategy(nextStrategy)) void updateStrategy(nextStrategy);
          }}
          value={strategy}
        >
          <option value="word-based">{t('settings.general.searchEnhancement.option.wordBased')}</option>
          <option value="cjk-trigram">{t('settings.general.searchEnhancement.option.cjk')}</option>
        </select>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function InterfaceBehaviorSection() {
  const t = useTranslation();
  const enabled = useActionHelpCardsEnabled();
  return (
    <SettingsSection ariaLabel={t('settings.appearance.interface.aria')} title={t('settings.appearance.interface.section')}>
      <SettingsRow data-settings-search-row-id="general-action-help" description={t('settings.appearance.actionHelp.description')} title={t('settings.appearance.actionHelp.row')}>
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <button aria-checked={enabled} aria-label={t('settings.appearance.actionHelp.row')} className={settingsSwitchClassName(enabled)} onClick={() => setActionHelpCardsEnabled(!enabled)} role="switch" type="button">
            <span aria-hidden="true" className={settingsSwitchKnobClassName(enabled)} />
          </button>
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}

export function SettingsGeneralSection({
  previewDesktopSettings = false
}: {
  previewDesktopSettings?: boolean;
}) {
  const t = useTranslation();
  return (
    <>
      <SettingsGeneralSystemSection previewDesktopSettings={previewDesktopSettings} />
      <InterfaceBehaviorSection />
      <SettingsSection ariaLabel={t('settings.general.search.aria')} title={t('settings.general.search.section')}>
        <SearchEnhancementRow />
      </SettingsSection>
      <SettingsCaptureSection />
    </>
  );
}
