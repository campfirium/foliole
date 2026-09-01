import { Plus, Trash2 } from 'lucide-react';

import type { NativeAssistantFailureCategory } from '../../../../../lib/platform/nativeAssistantContract';
import { NATIVE_ASSISTANT_CODEX_MODEL_ID } from '../../../../../lib/platform/nativeAssistantModelSettingsContract';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  AppStatusBadge,
  settingsActionTableClassName,
  settingsActionTableAddButtonClassName,
  settingsActionTableHeaderClassName,
  settingsActionTableRowClassName,
  settingsButtonClassName,
  settingsFieldClassName,
  SettingsButton,
  SettingsSection,
  settingsUtilityIconButtonClassName
} from '../../../../shared/ui';

import {
  type SettingsCodexConnectionState,
  type SettingsModelDraft,
  useSettingsModels
} from './useSettingsModels';

const MODEL_COLUMNS = '[grid-template-columns:3.5rem_minmax(110px,0.65fr)_minmax(190px,1.2fr)_minmax(120px,0.75fr)_8rem_2.5rem]';

export function SettingsModelsSection() {
  const t = useTranslation();
  const state = useSettingsModels();
  return (
    <SettingsSection
      ariaLabel={t('settings.models.aria')}
    >
      {state.loadFailed ? <p className="text-ui-sm text-destructive">{t('settings.models.loadFailed')}</p> : null}
      <div className={settingsActionTableClassName()} role="table" aria-label={t('settings.models.aria')}>
        <ModelTableHeader />
        <ChatGptPlanRow
          active={state.settings.selected_model_id === NATIVE_ASSISTANT_CODEX_MODEL_ID}
          busy={state.busyId === NATIVE_ASSISTANT_CODEX_MODEL_ID}
          connection={state.codexConnection}
          onSelect={() => void state.select(NATIVE_ASSISTANT_CODEX_MODEL_ID)}
          connecting={state.codexSigningIn}
          onConnect={() => void state.signInCodex()}
        />
        {state.drafts.map((draft) => (
          <CustomModelRow
            active={state.settings.selected_model_id === draft.id}
            busy={state.busyId === draft.id}
            draft={draft}
            key={draft.id}
            onRemove={() => void state.remove(draft)}
            onSelect={() => void state.select(draft.id)}
            onTest={() => void state.test(draft)}
            onUpdate={(patch) => state.update(draft, patch)}
          />
        ))}
        {state.drafts.some((draft) => !draft.persisted) ? null : (
          <div className={settingsActionTableRowClassName(MODEL_COLUMNS, 'pb-3 pt-1')}>
            <button
              className={settingsActionTableAddButtonClassName()}
              onClick={state.add}
              type="button"
            >
              <Plus aria-hidden size={15} strokeWidth={1.9} />
              {t('settings.models.add')}
            </button>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}

function ModelTableHeader() {
  const t = useTranslation();
  return (
    <div className={settingsActionTableHeaderClassName(MODEL_COLUMNS)}>
      <span className="text-center">{t('settings.models.header.use')}</span>
      <span>{t('settings.models.header.model')}</span>
      <span>{t('settings.models.header.endpoint')}</span>
      <span>{t('settings.models.header.key')}</span>
      <span className="text-center">{t('settings.models.header.connection')}</span>
      <span aria-hidden />
    </div>
  );
}

function ChatGptPlanRow(props: {
  active: boolean;
  busy: boolean;
  connection: SettingsCodexConnectionState;
  connecting: boolean;
  onConnect: () => void;
  onSelect: () => void;
}) {
  const t = useTranslation();
  return (
    <div className={settingsActionTableRowClassName(MODEL_COLUMNS)}>
      <ModelRadio active={props.active} disabled={props.busy || props.connecting} label={t('settings.models.chatgpt.plan')} onSelect={props.onSelect} />
      <strong className="text-ui-sm font-medium">{t('settings.models.chatgpt.plan')}</strong>
      <div className="col-span-2 flex min-w-0 items-center gap-4">
        <span className="text-ui-sm text-foreground/60">{t('settings.models.chatgpt.allowance')}</span>
        <AppStatusBadge
          label={t(`settings.models.chatgpt.status.${props.connection}`)}
          tone={codexStatusTone(props.connection)}
        />
      </div>
      {props.connection === 'signed_out' || props.connection === 'connecting' ? (
        <SettingsButton
          className="w-full px-2"
          loading={props.connecting}
          loadingLabel={t('settings.models.chatgpt.connecting')}
          onClick={props.onConnect}
        >
          {t('settings.models.chatgpt.connect')}
        </SettingsButton>
      ) : <span aria-hidden />}
      <span aria-hidden />
    </div>
  );
}

function codexStatusTone(connection: SettingsCodexConnectionState) {
  if (connection === 'connected') return 'success' as const;
  if (connection === 'signed_out') return 'warning' as const;
  return 'neutral' as const;
}

function CustomModelRow(props: {
  active: boolean;
  busy: boolean;
  draft: SettingsModelDraft;
  onRemove: () => void;
  onSelect: () => void;
  onTest: () => void;
  onUpdate: (patch: Partial<Pick<SettingsModelDraft, 'apiKey' | 'endpoint' | 'model'>>) => void;
}) {
  const t = useTranslation();
  const canTest = Boolean(props.draft.endpoint.trim() && props.draft.model.trim()
    && (props.draft.hasApiKey || props.draft.apiKey.trim()));
  return (
    <>
      <div className={settingsActionTableRowClassName(MODEL_COLUMNS)}>
        <ModelRadio active={props.active} disabled={!props.draft.selectable || props.busy} label={props.draft.model || t('settings.models.custom')} onSelect={props.onSelect} />
        <input aria-label={t('settings.models.header.model')} className={settingsFieldClassName()} onChange={(event) => props.onUpdate({ model: event.target.value })} placeholder={props.draft.persisted ? undefined : t('settings.models.custom')} value={props.draft.model} />
        <input aria-label={t('settings.models.header.endpoint')} className={settingsFieldClassName('font-mono text-[0.78rem]')} onChange={(event) => props.onUpdate({ endpoint: event.target.value })} spellCheck={false} type="url" value={props.draft.endpoint} />
        <input aria-label={t('settings.models.header.key')} autoComplete="off" className={settingsFieldClassName()} onChange={(event) => props.onUpdate({ apiKey: event.target.value })} placeholder={props.draft.hasApiKey ? '••••••••' : undefined} type="password" value={props.draft.apiKey} />
        <TestButton busy={props.draft.testing} disabled={!canTest} onTest={props.onTest} />
        {props.draft.persisted ? (
          <button aria-label={t('settings.models.remove')} className={settingsUtilityIconButtonClassName(false)} disabled={props.active || props.busy} onClick={props.onRemove} type="button">
            <Trash2 aria-hidden size={15} />
          </button>
        ) : <span aria-hidden />}
      </div>
      {props.draft.result ? (
        <InlineResult
          {...(props.draft.result === 'ready' ? {} : { category: props.draft.result })}
          ready={props.draft.result === 'ready'}
        />
      ) : null}
    </>
  );
}

function ModelRadio(props: { active: boolean; disabled: boolean; label: string; onSelect: () => void }) {
  const t = useTranslation();
  return (
    <div className="flex justify-center">
      <input aria-label={t('settings.models.select', { model: props.label })} checked={props.active} className="size-4 cursor-pointer accent-primary disabled:cursor-default disabled:opacity-40" disabled={props.disabled} name="aide-model-selection" onChange={props.onSelect} type="radio" />
    </div>
  );
}

function TestButton(props: { busy: boolean; disabled: boolean; onTest: () => void }) {
  const t = useTranslation();
  return <button className={settingsButtonClassName('w-full px-2')} disabled={props.disabled || props.busy} onClick={props.onTest} type="button">{t('settings.models.test')}</button>;
}

function InlineResult(props: {
  category?: NativeAssistantFailureCategory;
  ready: boolean;
}) {
  const t = useTranslation();
  let key: 'settings.models.connection.authFailed' | 'settings.models.connection.busy' | 'settings.models.connection.failed' | 'settings.models.connection.ready' | 'settings.models.connection.timeout' | 'settings.models.connection.toolsUnsupported';
  if (props.ready) key = 'settings.models.connection.ready';
  else if (props.category === 'auth_failed') key = 'settings.models.connection.authFailed';
  else if (props.category === 'timeout') key = 'settings.models.connection.timeout';
  else if (props.category === 'busy' || props.category === 'overloaded') key = 'settings.models.connection.busy';
  else if (props.category === 'model_tools_unsupported') key = 'settings.models.connection.toolsUnsupported';
  else key = 'settings.models.connection.failed';
  return <div className={`border-t border-settings-divider/55 px-4 py-2 text-ui-xs ${props.ready ? 'text-foreground/60' : 'text-destructive'}`}>{t(key)}</div>;
}
