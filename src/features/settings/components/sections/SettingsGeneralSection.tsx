import { useEffect, useState } from 'react';

import { isAppLanguagePreference } from '../../../../shared/localization/appLanguage';
import { useLocalization, useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  loadLoginItemSettingsFromRuntime,
  saveLoginItemSettingsToRuntime,
  type RuntimeLoginItemSettingsState
} from '../../../../shared/platform/loginItemSettings';
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
  settingsFieldClassName,
  settingsSwitchClassName,
  settingsSwitchKnobClassName
} from '../../../../shared/ui';
import { settingsSearchRowProps } from '../../model/settingsSearch';
import { useLocalizedSettingsSearchRow } from '../useLocalizedSettingsSearchRows';

import { SettingsSelectRow } from './settingsAppearanceControls';

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

function LanguageSection() {
  const { languagePreference, setLanguagePreference } = useLocalization();
  const t = useTranslation();
  return (
    <SettingsSection ariaLabel={t('settings.general.language.section')} title={t('settings.general.language.section')}>
      <div {...settingsSearchRowProps({ categoryId: 'general', id: 'general-app-language', title: '', description: '' })}>
        <SettingsSelectRow
          ariaLabel={t('settings.general.language.aria')}
          description={t('settings.general.language.description')}
          label={t('settings.general.language.row')}
          onChange={(value) => setLanguagePreference(isAppLanguagePreference(value) ? value : 'system')}
          options={[
            { label: t('language.system'), value: 'system' },
            { label: t('language.en'), value: 'en' },
            { label: t('language.zhHans'), value: 'zh-Hans' }
          ]}
          value={languagePreference}
        />
      </div>
    </SettingsSection>
  );
}

function getOpenAtLoginDescription(state: RuntimeLoginItemSettingsState | null, t: Translate) {
  if (state?.enabled && !state.effective) {
    return t('settings.general.openAtLogin.ineffective');
  }
  return t('settings.general.openAtLogin.description');
}

function OpenAtLoginRow(props: {
  setState: (state: RuntimeLoginItemSettingsState) => void;
  state: RuntimeLoginItemSettingsState;
}) {
  const t = useTranslation();
  const openAtLoginRow = useLocalizedSettingsSearchRow('general-open-at-login');
  const [isUpdating, setIsUpdating] = useState(false);

  const updateEnabled = async (nextEnabled: boolean) => {
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

function SystemSection() {
  const t = useTranslation();
  const [state, setState] = useState<RuntimeLoginItemSettingsState | null>(null);

  useEffect(() => {
    let active = true;
    void loadLoginItemSettingsFromRuntime().then((nextState) => {
      if (active) setState(nextState);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!state?.supported) {
    return null;
  }

  return (
    <SettingsSection ariaLabel={t('settings.general.system.aria')} title={t('settings.general.system.section')}>
      <OpenAtLoginRow setState={setState} state={state} />
    </SettingsSection>
  );
}

export function SettingsGeneralSection() {
  const t = useTranslation();
  return (
    <>
      <LanguageSection />
      <SystemSection />
      <SettingsSection ariaLabel={t('settings.general.search.aria')} title={t('settings.general.search.section')}>
        <SearchEnhancementRow />
      </SettingsSection>
    </>
  );
}
