import { useCallback, useEffect, useRef, useState } from 'react';

import type { ReadwiseSourceMode } from '../../../lib/core/import/importManagerSettings';
import {
  createDefaultReadwiseAutoImportPolicy,
  type ReadwiseAutoImportPolicy,
  type ReadwiseAutoImportPolicyField,
  type ReadwiseImportDestination
} from '../../../lib/core/import/readwiseAutoImportPolicy';
import { canResolveReadwiseSourceModeConflict } from '../../../lib/core/import/readwiseSourceMode';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { SettingsSection, SettingsSegmentedRow } from '../../shared/ui';

import { ReadwiseApiMigrationAction } from './ReadwiseApiMigrationAction';
import {
  ReadwiseApiConnectionRow,
  ReadwiseApiOperationsRows,
  type ReadwiseApiModeSettings
} from './ReadwiseApiModeSettingsRows';
import { useReadwiseApiTaskStatus } from './ReadwiseApiTaskStatus';
import { ReadwiseBehaviorSection } from './ReadwiseFolderSettingsSections';
import { ReadwiseMigrationFailures } from './ReadwiseMigrationFailures';
import { ReadwiseMigrationProgress } from './ReadwiseMigrationProgress';
import { useReadwiseSourceMigration } from './useReadwiseSourceMigration';

type PolicyField = Exclude<keyof ReadwiseAutoImportPolicy, 'version'>;
const DEFAULT_API_POLICY = createDefaultReadwiseAutoImportPolicy();

interface ReadwiseSourceModeSectionProps {
  apiSettings?: ReadwiseApiModeSettings;
  apiMigrationCompleted?: boolean;
  committedMode?: ReadwiseSourceMode;
  conflictReasons?: string[];
  mode: ReadwiseSourceMode;
  onChange: (mode: ReadwiseSourceMode) => void;
  onChangePolicy?: (field: PolicyField, value: ReadwiseImportDestination | string) => void;
  onCommitApiPolicy?: (policy: ReadwiseAutoImportPolicy) => Promise<void> | void;
  onCommitMode?: (mode: ReadwiseSourceMode) => void;
  policy?: ReadwiseAutoImportPolicy;
}

export function ReadwiseSourceModeSection(props: ReadwiseSourceModeSectionProps) {
  const state = useReadwiseSourceModeState(props);
  return (
    <>
      <ReadwiseSourceSelector props={props} state={state} />
      {props.mode === 'api' && props.apiSettings
        ? <ReadwiseApiSettingsSections apiSettings={props.apiSettings} state={state} />
        : null}
    </>
  );
}

function useReadwiseSourceModeState(props: ReadwiseSourceModeSectionProps) {
  const t = useTranslation();
  const committedMode = props.committedMode ?? props.mode;
  const savedPolicy = props.policy ?? DEFAULT_API_POLICY;
  const [apiDraft, setApiDraft] = useState(savedPolicy);
  const [apiConnectedState, setApiConnected] = useState<boolean | null>(null);
  const apiConnected = apiConnectedState === true;
  const connectionObserved = useRef(false);
  const connectionWasReady = useRef(false);
  const selectApi = useCallback(() => {
    setApiDraft(savedPolicy);
    props.onChange('api');
  }, [props.onChange, savedPolicy]);
  const migration = useReadwiseSourceMigration({
    committedMode,
    ...(props.onCommitMode ? { onCommitMode: props.onCommitMode } : {}),
    onSelectApi: selectApi,
    t
  });
  const taskStatus = useReadwiseApiTaskStatus(props.apiSettings?.syncIsRunning ?? false);
  const preparingApi = committedMode !== 'api' && props.mode === 'api'
    && !props.apiMigrationCompleted;
  const migrationActive = Boolean(
    preparingApi && (migration.pending || migration.required || migration.phase)
      || taskStatus?.cutover.status === 'in_progress'
  );

  useEffect(() => {
    if (props.mode !== 'api' || committedMode === 'api') setApiDraft(savedPolicy);
  }, [committedMode, props.mode, savedPolicy]);

  useEffect(() => {
    if (apiConnectedState === null) return;
    if (!connectionObserved.current) {
      connectionObserved.current = true;
      connectionWasReady.current = apiConnectedState;
      return;
    }
    const becameReady = apiConnected && !connectionWasReady.current;
    connectionWasReady.current = apiConnected;
    if (becameReady && migration.required && migration.failed) void migration.start();
  }, [apiConnected, apiConnectedState, migration.failed, migration.required, migration.start]);

  function changePolicy(field: PolicyField, value: ReadwiseImportDestination | string) {
    if (preparingApi) setApiDraft((current) => ({ ...current, [field]: value }));
    else props.onChangePolicy?.(field, value);
  }

  async function commitApiPolicy() {
    if (props.onCommitApiPolicy) return props.onCommitApiPolicy(apiDraft);
    Object.entries(apiDraft).forEach(([field, value]) => {
      if (field === 'version') return;
      props.onChangePolicy?.(
        field as ReadwiseAutoImportPolicyField | 'importTag',
        value as ReadwiseImportDestination | string
      );
    });
  }

  return {
    apiConnected, apiDraft, cancelPreparation: () => props.onChange(committedMode),
    changePolicy, commitApiPolicy, committedMode, migration, migrationActive,
    preparingApi, savedPolicy, setApiConnected, taskStatus
  };
}

type SourceModeState = ReturnType<typeof useReadwiseSourceModeState>;

function ReadwiseSourceSelector(props: {
  props: ReadwiseSourceModeSectionProps;
  state: SourceModeState;
}) {
  const t = useTranslation();
  const conflictReasons = props.props.conflictReasons ?? [];
  const canResolveConflict = canResolveReadwiseSourceModeConflict({
    currentMode: props.state.committedMode,
    hasCompletion: Boolean(props.props.apiMigrationCompleted),
    reasons: conflictReasons,
    targetMode: 'api'
  });
  async function chooseMode(mode: ReadwiseSourceMode) {
    if (mode === props.props.mode) return;
    if (mode === 'api' && props.state.committedMode !== 'api'
      && !props.props.apiMigrationCompleted) {
      await props.state.migration.selectApi();
      return;
    }
    props.props.onChange(mode);
    props.props.onCommitMode?.(mode);
  }
  const footer = conflictReasons.length ? (
    <p className="text-ui-sm text-error" role="status">
      {t('desktop.readwise.source.conflict')}
    </p>
  ) : props.props.mode === 'api' ? (
    props.state.preparingApi && !props.state.migrationActive
      ? <p className="text-ui-sm text-foreground/58">{t('desktop.readwise.api.setup.pending')}</p>
      : <ReadwiseMigrationProgress
          migration={props.state.migration}
          onRetry={() => void props.state.migration.start()}
          taskStatus={props.state.taskStatus}
        />
  ) : null;
  return (
    <SettingsSection ariaLabel={t('desktop.readwise.source.title')}>
      <SettingsSegmentedRow
        ariaLabel={t('desktop.readwise.source.mode.aria')}
        controlAlignment="description"
        controlFooter={footer}
        description={<>{t('desktop.readwise.source.mode.description')}<span className="mt-4 block">{t('desktop.readwise.source.description')}</span></>}
        disabled={Boolean(conflictReasons.length && !canResolveConflict) || props.state.migrationActive}
        label={t('desktop.readwise.source.mode.title')}
        onChange={(value) => void chooseMode(value as ReadwiseSourceMode)}
        options={[
          { label: t('desktop.readwise.source.mode.off'), value: 'off' },
          {
            disabled: Boolean(props.props.apiMigrationCompleted),
            label: t('desktop.readwise.source.mode.folder'), value: 'relay'
          },
          { label: t('desktop.readwise.source.mode.api'), value: 'api' }
        ]}
        value={props.props.mode}
      />
    </SettingsSection>
  );
}

function ReadwiseApiSettingsSections(props: {
  apiSettings: ReadwiseApiModeSettings;
  state: SourceModeState;
}) {
  const t = useTranslation();
  const state = props.state;
  return (
    <>
      <ReadwiseBehaviorSection
        disabled={state.migrationActive}
        onChange={state.changePolicy}
        onChangeImportTag={(value) => state.changePolicy('importTag', value)}
        policy={state.preparingApi ? state.apiDraft : state.savedPolicy}
        sourceMode="api"
      />
      <SettingsSection ariaLabel={t('desktop.readwise.api.connection.title')}>
        <ReadwiseApiConnectionRow
          migration={state.preparingApi}
          migrationStatus={state.migration.phase || state.taskStatus?.cutover.status === 'in_progress' ? (
            <ReadwiseMigrationProgress compact migration={state.migration} taskStatus={state.taskStatus} />
          ) : null}
          onConnectionChange={state.setApiConnected}
        />
      </SettingsSection>
      {state.preparingApi && !state.migrationActive ? (
        <ReadwiseApiMigrationAction
          connected={state.apiConnected}
          onCancel={state.cancelPreparation}
          onMigrate={() => void state.migration.requestStart(state.commitApiPolicy)}
        />
      ) : null}
      {state.committedMode === 'api' ? (
        <SettingsSection ariaLabel={t('desktop.readwise.section.sync.aria')}>
          <ReadwiseApiOperationsRows
            migrationActive={state.migrationActive}
            settings={props.apiSettings}
            taskStatus={state.taskStatus}
          />
        </SettingsSection>
      ) : null}
      <ReadwiseMigrationFailures failures={state.migration.failures ?? []} />
    </>
  );
}
