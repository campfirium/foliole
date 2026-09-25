import { useCallback, useEffect, useState } from 'react';

import type {
  NativeReadwiseHostAssignment
} from '../../../lib/platform/nativeReadwiseHostContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { onDesktopSyncGroupOverviewChanged } from '../../shared/platform/desktopSyncGroupRuntimeRepository';
import {
  activateReadwiseOnThisHostInRuntime,
  loadReadwiseHostAssignmentFromRuntime
} from '../../shared/platform/import/readwiseHostAssignmentRuntimeRepository';
import {
  AppButton,
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection
} from '../../shared/ui';

export function useReadwiseHostAssignment() {
  const [assignment, setAssignment] = useState<NativeReadwiseHostAssignment | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    setAssignment(await loadReadwiseHostAssignmentFromRuntime());
  }, []);
  useEffect(() => {
    let active = true;
    void loadReadwiseHostAssignmentFromRuntime().then((value) => {
      if (active) setAssignment(value);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => onDesktopSyncGroupOverviewChanged(() => {
    void refresh();
  }) ?? undefined, [refresh]);
  return {
    assignment,
    error,
    pending,
    refresh,
    activate: async () => {
      setPending(true);
      setError(false);
      try { setAssignment(await activateReadwiseOnThisHostInRuntime()); }
      catch { setError(true); await refresh(); }
      finally { setPending(false); }
    }
  };
}

export function ReadwiseHostAssignmentRow(props: {
  assignment: NativeReadwiseHostAssignment | null;
  error?: boolean;
  onActivate: () => void;
  pending?: boolean;
}) {
  const t = useTranslation();
  if (!props.assignment || props.assignment.is_active) return null;

  const reason = props.assignment.activation_blocked_reason;
  const description = props.assignment.handoff_pending
    ? t('desktop.readwise.host.switchingDescription')
    : props.error ? t('desktop.readwise.host.retry')
      : reason === 'guard-history' ? t('desktop.readwise.host.guardHistory')
        : reason === 'guard-unavailable' ? t('desktop.readwise.host.restoreGuard')
          : reason === 'handoff-in-progress' ? t('desktop.readwise.host.handoffInProgress')
            : undefined;
  return (
    <SettingsSection ariaLabel={t('desktop.readwise.host.title')} title={t('desktop.readwise.host.title')}>
      <SettingsRow
        description={description}
        title={props.assignment.active_host_name ?? t('desktop.readwise.host.notSelected')}
      >
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <AppButton disabled={props.pending || props.assignment.handoff_pending ||
            reason === 'guard-history' || reason === 'handoff-in-progress'}
            loading={Boolean(props.pending)} onClick={props.onActivate} size="sm">
            {props.assignment.handoff_pending
              ? t('desktop.readwise.host.switching') : t('desktop.readwise.host.switch')}
          </AppButton>
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}
