import { useEffect, useState } from 'react';

import type { ReadwiseSyncFrequency } from '../../../lib/core/import/readwiseReaderSettings';
import type { NativeReadwiseApiScheduleStatus } from '../../../lib/platform/nativeReadwiseApiImportContract';
import { useTranslation, type Translate } from '../../shared/localization/LocalizationProvider';
import { loadReadwiseApiScheduleStatusInRuntime } from '../../shared/platform/readwiseReaderImportRuntimeRepository';
import { AppButton, SettingsControlSlot, SettingsRow, SettingsSection } from '../../shared/ui';

import { ReadwiseSyncFrequencySelect } from './ReadwiseReaderSyncControls';

export function ReadwiseApiImportSection(props: {
  disabled: boolean;
  frequency: ReadwiseSyncFrequency;
  isRunning: boolean;
  onChangeFrequency: (value: ReadwiseSyncFrequency) => void;
  onPreview: () => void;
}) {
  const t = useTranslation();
  const schedule = useReadwiseApiScheduleStatus(props.isRunning);
  return (
    <SettingsSection
      ariaLabel={t('desktop.readwise.api.import.title')}
      description={t('desktop.readwise.api.import.description')}
      title={t('desktop.readwise.api.import.title')}
    >
      <ManualImportRow {...props} t={t} />
      <SettingsRow
        description={<ReadwiseApiScheduleDescription schedule={schedule} t={t} />}
        title={t('desktop.readwise.api.schedule.title')}
      >
        <SettingsControlSlot>
          <ReadwiseSyncFrequencySelect onChange={props.onChangeFrequency} value={props.frequency} />
          {schedule?.last_result?.status === 'failed' && schedule.eligibility !== 'connection_required' ? (
            <AppButton disabled={props.disabled} onClick={props.onPreview} size="sm">
              {t('desktop.readwise.api.schedule.retry')}
            </AppButton>
          ) : null}
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}

function ManualImportRow(props: Parameters<typeof ReadwiseApiImportSection>[0] & { t: Translate }) {
  return (
    <SettingsRow description={props.t('desktop.readwise.api.import.actionDescription')} title={props.t('desktop.readwise.api.import.actionTitle')}>
      <SettingsControlSlot>
        <AppButton disabled={props.disabled} onClick={props.onPreview} size="sm" variant="emphasis">
          {props.t(props.isRunning ? 'desktop.readwise.api.import.preparing' : 'desktop.readwise.api.import.preview')}
        </AppButton>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function useReadwiseApiScheduleStatus(refreshKey: boolean) {
  const [status, setStatus] = useState<NativeReadwiseApiScheduleStatus | null>(null);
  useEffect(() => {
    let active = true;
    void loadReadwiseApiScheduleStatusInRuntime().then((value) => {
      if (active) setStatus(value);
    });
    return () => { active = false; };
  }, [refreshKey]);
  return status;
}

function ReadwiseApiScheduleDescription(props: {
  schedule: NativeReadwiseApiScheduleStatus | null;
  t: Translate;
}) {
  const schedule = props.schedule;
  if (!schedule) return <>{props.t('desktop.readwise.api.schedule.loading')}</>;
  if (schedule.running) return <>{props.t('desktop.readwise.api.schedule.running')}</>;
  const result = schedule.last_result;
  if (result?.status === 'failed') {
    return <span className="text-error">{props.t('desktop.readwise.api.schedule.failed', {
      stage: props.t(`desktop.readwise.api.schedule.stage.${result.error_stage ?? 'eligibility'}`)
    })}</span>;
  }
  if (schedule.eligibility === 'first_import_required') {
    return <>{props.t('desktop.readwise.api.schedule.firstImport')}</>;
  }
  if (schedule.eligibility !== 'ready') {
    return <>{props.t('desktop.readwise.api.schedule.unavailable')}</>;
  }
  if (result) {
    return <>{props.t('desktop.readwise.api.schedule.lastResult', {
      count: result.imported_count,
      time: new Date(result.completed_at).toLocaleString()
    })}</>;
  }
  return <>{props.t('desktop.readwise.api.schedule.ready')}</>;
}
