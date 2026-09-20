import { useCallback, useEffect, useState } from 'react';

import type {
  NativeReadwiseHostAssignment,
  NativeReadwiseWorkgroupHost
} from '../../../lib/platform/nativeReadwiseHostContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
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

const PLATFORM_NAMES: Record<string, string> = { darwin: 'macOS', linux: 'Linux', win32: 'Windows' };

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

function activeHost(assignment: NativeReadwiseHostAssignment): NativeReadwiseWorkgroupHost | null {
  if (!assignment.active_host_name) return null;
  return assignment.hosts.find((host) => host.host_name === assignment.active_host_name) ?? {
    host_name: assignment.active_host_name,
    platform: null
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

  const host = activeHost(props.assignment);
  const unavailable = !host || (
    host.host_name === props.assignment.active_host_name && host.platform === null
  );
  const reason = props.assignment.activation_blocked_reason;
  const description = props.error ? t('desktop.readwise.host.retry')
    : reason === 'group-quiescence-required'
    ? t('desktop.readwise.host.waitForDevices')
    : reason === 'handoff-required' ? t('desktop.readwise.host.waitForHandoff')
      : reason === 'handoff-in-progress' ? t('desktop.readwise.host.handoffInProgress')
      : reason === 'guard-unavailable' ? t('desktop.readwise.host.restoreGuard')
      : reason === 'guard-history' ? t('desktop.readwise.host.guardHistory')
      : reason === 'connection-unavailable' ? t('desktop.readwise.host.connectFirst')
        : !unavailable && host?.platform ? PLATFORM_NAMES[host.platform] ?? host.platform : undefined;
  return (
    <SettingsSection ariaLabel={t('desktop.readwise.host.title')} title={t('desktop.readwise.host.title')}>
      <SettingsRow
        description={description}
        title={props.assignment.legacy_unassigned ? t('desktop.readwise.host.notSelected')
          : !unavailable && host ? host.host_name : t('desktop.readwise.host.unavailable')}
      >
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <AppButton disabled={props.pending || reason === 'connection-unavailable' ||
            reason === 'guard-history' ||
            reason === 'handoff-in-progress'}
            loading={Boolean(props.pending)} onClick={props.onActivate} size="sm">
            {props.assignment.legacy_unassigned
              ? t('desktop.readwise.host.useThisDevice') : t('desktop.readwise.host.switch')}
          </AppButton>
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}
