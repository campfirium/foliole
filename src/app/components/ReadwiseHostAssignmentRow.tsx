import { useEffect, useState } from 'react';

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
  useEffect(() => {
    let active = true;
    void loadReadwiseHostAssignmentFromRuntime().then((value) => {
      if (active) setAssignment(value);
    });
    return () => { active = false; };
  }, []);
  return {
    assignment,
    activate: async () => setAssignment(await activateReadwiseOnThisHostInRuntime())
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
  onActivate: () => void;
}) {
  const t = useTranslation();
  if (!props.assignment || props.assignment.is_active) return null;

  const host = activeHost(props.assignment);
  const unavailable = !host || (
    host.host_name === props.assignment.active_host_name && host.platform === null
  );
  return (
    <SettingsSection ariaLabel={t('desktop.readwise.host.title')} title={t('desktop.readwise.host.title')}>
      <SettingsRow
        description={!unavailable && host?.platform ? PLATFORM_NAMES[host.platform] ?? host.platform : undefined}
        title={!unavailable && host ? host.host_name : t('desktop.readwise.host.unavailable')}
      >
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <AppButton onClick={props.onActivate} size="sm">
            {t('desktop.readwise.host.switch')}
          </AppButton>
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}
