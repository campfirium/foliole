import type { NativeAssistantByokSettings } from '../../../../../lib/platform/nativeAssistantByokContract';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  AppButton,
  AppErrorState,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsFieldClassName
} from '../../../../shared/ui';

import { useSettingsAideByok } from './useSettingsAideByok';

type Translate = ReturnType<typeof useTranslation>;
type SettingsState = ReturnType<typeof useSettingsAideByok>;

export function SettingsAideByokSection() {
  const t = useTranslation();
  const state = useSettingsAideByok();
  return (
    <SettingsSection
      ariaLabel={t('settings.general.aide.byok.aria')}
      description={t('settings.general.aide.byok.description')}
      title={t('settings.general.aide.byok.section')}
    >
      {state.error ? (
        <AppErrorState
          description={t('settings.general.aide.byok.error.description')}
          surface="panel"
          title={t('settings.general.aide.byok.error.title')}
        />
      ) : null}
      <AideByokForm state={state} t={t} />
    </SettingsSection>
  );
}

function AideByokForm({ state, t }: { state: SettingsState; t: Translate }) {
  return (
    <form className="contents" onSubmit={(event) => void state.save(event)}>
      <AideByokInputRow
        disabled={state.disabled}
        label={t('settings.general.aide.byok.endpoint.aria')}
        name="foliole-aide-byok-endpoint"
        onChange={state.setEndpoint}
        title={t('settings.general.aide.byok.endpoint.title')}
        type="url"
        value={state.endpoint}
      />
      <AideByokInputRow
        disabled={state.disabled}
        label={t('settings.general.aide.byok.model.aria')}
        name="foliole-aide-byok-model"
        onChange={state.setModel}
        title={t('settings.general.aide.byok.model.title')}
        value={state.model}
      />
      <AideByokCredentialRow state={state} t={t} />
      <AideByokStatusRow state={state} t={t} />
    </form>
  );
}

function AideByokCredentialRow({ state, t }: { state: SettingsState; t: Translate }) {
  return (
    <SettingsRow
      description={state.endpointNeedsKey && !state.keyEntered
        ? t('settings.general.aide.byok.key.endpointChanged')
        : t('settings.general.aide.byok.key.description')}
      title={t('settings.general.aide.byok.key.title')}
    >
      <SettingsControlSlot>
        <input
          aria-label={t('settings.general.aide.byok.key.aria')}
          autoComplete="off"
          className={settingsFieldClassName()}
          disabled={state.disabled}
          name="foliole-aide-byok-api-key"
          onInput={(event) => state.setKeyEntered(Boolean(event.currentTarget.value))}
          placeholder={state.settings.has_api_key ? '••••••••' : undefined}
          ref={state.apiKeyRef}
          type="password"
        />
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function AideByokStatusRow({ state, t }: { state: SettingsState; t: Translate }) {
  return (
    <SettingsRow description={getStatusCopy(state.settings, t)} title={t('settings.general.aide.byok.status.title')}>
      <SettingsControlSlot className="flex-row gap-2">
        {state.settings.has_api_key ? (
          <AppButton disabled={state.disabled} onClick={() => void state.disconnect()} type="button">
            {t('settings.general.aide.byok.remove')}
          </AppButton>
        ) : null}
        <AppButton
          disabled={state.disabled || !state.canSave}
          loading={state.status === 'saving'}
          loadingLabel={t('settings.general.aide.byok.saving')}
          type="submit"
        >
          {t('settings.general.aide.byok.save')}
        </AppButton>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function getStatusCopy(settings: NativeAssistantByokSettings, t: Translate) {
  if (settings.state === 'configured') return t('settings.general.aide.byok.status.configured');
  if (settings.state === 'secure_storage_unavailable') {
    return t('settings.general.aide.byok.status.secureStorageUnavailable');
  }
  return t('settings.general.aide.byok.status.notConfigured');
}

function AideByokInputRow(props: {
  disabled: boolean;
  label: string;
  name: string;
  onChange: (value: string) => void;
  title: string;
  type?: 'text' | 'url';
  value: string;
}) {
  return (
    <SettingsRow title={props.title}>
      <SettingsControlSlot>
        <input
          aria-label={props.label}
          autoComplete="off"
          className={settingsFieldClassName()}
          disabled={props.disabled}
          name={props.name}
          onChange={(event) => props.onChange(event.target.value)}
          spellCheck={false}
          type={props.type ?? 'text'}
          value={props.value}
        />
      </SettingsControlSlot>
    </SettingsRow>
  );
}
