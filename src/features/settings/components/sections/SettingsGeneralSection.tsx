import { useEffect, useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { setActionHelpCardsEnabled, useActionHelpCardsEnabled } from '../../../../shared/platform/actionHelpCards';
import { isDesktopRuntime } from '../../../../shared/platform/runtime';
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
  settingsButtonClassName,
  settingsFieldClassName
} from '../../../../shared/ui';
import { settingsSwitchClassName, settingsSwitchKnobClassName } from '../../../../shared/ui';
import { SettingsSuperMemoImport } from '../../../import/components/SettingsSuperMemoImport';
import { requestAideSettingsDialogOpen } from '../../model/aideSettingsDialogRequests';
import { requestCustomCopyDialogOpen } from '../../model/customCopyDialogRequests';
import { settingsSearchRowProps } from '../../model/settingsSearch';
import { SETTINGS_CLI_SEARCH_ROW_ID, SETTINGS_MODELS_SEARCH_ROW_ID, SETTINGS_SUPER_MEMO_SEARCH_ROW_ID } from '../../model/settingsSearchRowCatalog';
import { useLocalizedSettingsSearchRow } from '../useLocalizedSettingsSearchRows';

import { SettingsAgentControlSection } from './SettingsAgentControlSection';
import { SettingsCaptureSection } from './SettingsCaptureSection';
import { SettingsCliSection } from './SettingsCliSection';
import { SettingsExperimentalFeaturesSection } from './SettingsExperimentalFeaturesSection';
import { SettingsGeneralSystemSection } from './SettingsGeneralSystemSection';
import { SettingsLanguageSection } from './SettingsLanguageSection';
import { SettingsLocalFileSection } from './SettingsLocalFileSection';
import { SettingsSearchAliasRow } from './SettingsSearchAliasRow';

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
  const customCopyRow = useLocalizedSettingsSearchRow('general-custom-copy');
  return (
    <SettingsSection ariaLabel={t('settings.appearance.interface.aria')} title={t('settings.appearance.interface.section')}>
      <SettingsRow {...settingsSearchRowProps(customCopyRow)} description={customCopyRow.description} title={customCopyRow.title}>
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <button className={settingsButtonClassName()} onClick={requestCustomCopyDialogOpen} type="button">
            {t('settings.customCopy.manage')}
          </button>
        </SettingsControlSlot>
      </SettingsRow>
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
  onCloseSettings = () => undefined,
  previewDesktopSettings = false
}: {
  onCloseSettings?: () => void;
  previewDesktopSettings?: boolean;
}) {
  const t = useTranslation();
  const showDesktopGroups = !previewDesktopSettings && isDesktopRuntime();
  return (
    <>
      <SettingsLanguageSection />
      <SettingsGeneralSystemSection previewDesktopSettings={previewDesktopSettings} />
      <InterfaceBehaviorSection />
      <SettingsSection ariaLabel={t('settings.general.search.aria')} title={t('settings.general.search.section')}>
        <SearchEnhancementRow />
        <SettingsSearchAliasRow preview={previewDesktopSettings} />
      </SettingsSection>
      <SettingsCaptureSection />
      {showDesktopGroups ? <SettingsLocalFileSection onFileSelected={onCloseSettings} /> : null}
      <SettingsSection
        ariaLabel={t('settings.general.aide.aria')}
        searchRowId={SETTINGS_MODELS_SEARCH_ROW_ID}
        title={t('settings.general.aide.section')}
      >
        <SettingsRow description={t('settings.general.aide.settingsDescription')} title={t('settings.general.aide.settingsRow')}>
          <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
            <button className={settingsButtonClassName()} disabled={previewDesktopSettings} onClick={requestAideSettingsDialogOpen} type="button">
              {t('settings.general.aide.settingsOpen')}
            </button>
          </SettingsControlSlot>
        </SettingsRow>
      </SettingsSection>
      {showDesktopGroups ? (
        <SettingsSection
          ariaLabel={t('settings.general.externalAccess.section')}
          searchRowId={SETTINGS_CLI_SEARCH_ROW_ID}
          title={t('settings.general.externalAccess.section')}
        >
          <SettingsCliSection />
          <SettingsAgentControlSection />
        </SettingsSection>
      ) : null}
      {showDesktopGroups ? (
        <SettingsSection searchRowId={SETTINGS_SUPER_MEMO_SEARCH_ROW_ID} title={t('settings.general.dataMigration.section')}>
          <SettingsSuperMemoImport />
        </SettingsSection>
      ) : null}
      {previewDesktopSettings ? null : <SettingsExperimentalFeaturesSection />}
    </>
  );
}
