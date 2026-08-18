import { useEffect, useState } from 'react';

import type { NativeReadwiseDeviceAssignment } from '../../../lib/platform/nativeReadwiseDeviceContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  activateReadwiseOnThisDeviceInRuntime,
  loadReadwiseDeviceAssignmentFromRuntime
} from '../../shared/platform/import/readwiseDeviceAssignmentRuntimeRepository';
import { AppButton, SettingsControlSlot, SettingsRow, SettingsSection } from '../../shared/ui';

export function useReadwiseDeviceAssignment() {
  const [assignment, setAssignment] = useState<NativeReadwiseDeviceAssignment | null>(null);
  useEffect(() => {
    let active = true;
    void loadReadwiseDeviceAssignmentFromRuntime().then((value) => {
      if (active) setAssignment(value);
    });
    return () => { active = false; };
  }, []);
  return {
    assignment,
    activate: async () => setAssignment(await activateReadwiseOnThisDeviceInRuntime())
  };
}

export function ReadwiseDeviceAssignmentRow(props: {
  assignment: NativeReadwiseDeviceAssignment | null;
  onActivate: () => void;
}) {
  const t = useTranslation();
  const assignment = props.assignment;
  const description = assignment?.legacy_unassigned
    ? t('desktop.readwise.device.unassigned')
    : assignment?.is_active
      ? t('desktop.readwise.device.current')
      : t('desktop.readwise.device.remote', { name: assignment?.active_device_name ?? '' });
  return (
    <SettingsSection ariaLabel={t('desktop.readwise.device.title')} title={t('desktop.readwise.device.title')}>
      <SettingsRow description={description} title={assignment?.active_device_name ?? assignment?.current_device_name ?? '—'}>
        {!assignment?.is_active || assignment?.legacy_unassigned ? (
          <SettingsControlSlot>
            <AppButton onClick={props.onActivate} size="sm">
              {t(assignment?.legacy_unassigned ? 'desktop.readwise.device.useThis' : 'desktop.readwise.device.switch')}
            </AppButton>
          </SettingsControlSlot>
        ) : null}
      </SettingsRow>
    </SettingsSection>
  );
}
