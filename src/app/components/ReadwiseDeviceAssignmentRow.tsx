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
  const devices = assignment?.devices ?? [];
  return (
    <SettingsSection
      ariaLabel={t('desktop.readwise.device.title')}
      description={t('desktop.readwise.device.description')}
      title={t('desktop.readwise.device.title')}
    >
      {devices.map((device) => {
        const current = device.device_id === assignment?.current_device_id;
        const active = device.device_id === assignment?.active_device_id;
        const description = active
          ? t('desktop.readwise.device.current')
          : current && assignment?.legacy_unassigned
            ? t('desktop.readwise.device.unassigned')
            : current
              ? t('desktop.readwise.device.thisDevice')
              : t('desktop.readwise.device.available');
        return (
          <SettingsRow description={description} key={device.device_id} readonly={!current} title={device.device_name}>
            {current && (!assignment?.is_active || assignment?.legacy_unassigned) ? (
              <SettingsControlSlot>
                <AppButton onClick={props.onActivate} size="sm">
                  {t(assignment?.legacy_unassigned ? 'desktop.readwise.device.useThis' : 'desktop.readwise.device.switch')}
                </AppButton>
              </SettingsControlSlot>
            ) : null}
          </SettingsRow>
        );
      })}
    </SettingsSection>
  );
}
