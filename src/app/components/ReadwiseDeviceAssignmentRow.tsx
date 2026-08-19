import { useEffect, useState } from 'react';

import type {
  NativeReadwiseDeviceAssignment,
  NativeReadwiseWorkgroupDevice
} from '../../../lib/platform/nativeReadwiseDeviceContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  activateReadwiseOnThisDeviceInRuntime,
  loadReadwiseDeviceAssignmentFromRuntime
} from '../../shared/platform/import/readwiseDeviceAssignmentRuntimeRepository';
import {
  AppButton,
  settingsActionTableHeaderClassName,
  settingsActionTableRowClassName
} from '../../shared/ui';

const REMOTE_READWISE_COLUMNS = '[grid-template-columns:16.25rem_minmax(0,1fr)]';
const PLATFORM_NAMES: Record<string, string> = { darwin: 'macOS', linux: 'Linux', win32: 'Windows' };

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

function activeDevice(assignment: NativeReadwiseDeviceAssignment): NativeReadwiseWorkgroupDevice | null {
  if (!assignment.active_device_id) return null;
  return assignment.devices.find((device) => device.device_id === assignment.active_device_id) ?? {
    device_id: assignment.active_device_id,
    device_name: assignment.active_device_name ?? assignment.active_device_id,
    platform: null
  };
}

export function ReadwiseDeviceAssignmentRow(props: {
  assignment: NativeReadwiseDeviceAssignment | null;
  onActivate: () => void;
  readwiseRootPath: string;
}) {
  const t = useTranslation();
  if (!props.assignment || props.assignment.is_active) return null;

  const device = activeDevice(props.assignment);
  const unavailable = !device || (
    device.device_name === props.assignment.active_device_id && device.platform === null
  );
  return (
    <section aria-label={t('desktop.readwise.device.title')} className="mb-6 min-w-0">
      <div className={settingsActionTableHeaderClassName(REMOTE_READWISE_COLUMNS)}>
        <span>{t('desktop.readwise.device.title')}</span>
        <span>{t('desktop.readwise.device.path')}</span>
      </div>
      <div className={settingsActionTableRowClassName(REMOTE_READWISE_COLUMNS)}>
        {!unavailable && device ? (
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-sm font-semibold">{device.device_name}</span>
            {device.platform ? (
              <span className="shrink-0 text-xs text-foreground/48">
                {PLATFORM_NAMES[device.platform] ?? device.platform}
              </span>
            ) : null}
          </div>
        ) : (
          <span className="text-sm text-foreground/55">{t('desktop.readwise.device.unavailable')}</span>
        )}
        <div className="grid min-h-10 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
          <span className="min-w-0 truncate font-mono text-xs text-foreground/68">
            {props.readwiseRootPath.trim() || t('desktop.readwise.device.pathUnavailable')}
          </span>
          <AppButton onClick={props.onActivate} size="sm">
            {t('desktop.readwise.device.switch')}
          </AppButton>
        </div>
      </div>
    </section>
  );
}
