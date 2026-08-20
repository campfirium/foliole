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
  settingsActionTableHeaderClassName,
  settingsActionTableRowClassName
} from '../../shared/ui';

const REMOTE_READWISE_COLUMNS = '[grid-template-columns:16.25rem_minmax(0,1fr)]';
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
  readwiseRootPath: string;
}) {
  const t = useTranslation();
  if (!props.assignment || props.assignment.is_active) return null;

  const host = activeHost(props.assignment);
  const unavailable = !host || (
    host.host_name === props.assignment.active_host_name && host.platform === null
  );
  return (
    <section aria-label={t('desktop.readwise.host.title')} className="mb-6 min-w-0">
      <div className={settingsActionTableHeaderClassName(REMOTE_READWISE_COLUMNS)}>
        <span>{t('desktop.readwise.host.title')}</span>
        <span>{t('desktop.readwise.host.path')}</span>
      </div>
      <div className={settingsActionTableRowClassName(REMOTE_READWISE_COLUMNS)}>
        {!unavailable && host ? (
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-sm font-semibold">{host.host_name}</span>
            {host.platform ? (
              <span className="shrink-0 text-xs text-foreground/48">
                {PLATFORM_NAMES[host.platform] ?? host.platform}
              </span>
            ) : null}
          </div>
        ) : (
          <span className="text-sm text-foreground/55">{t('desktop.readwise.host.unavailable')}</span>
        )}
        <div className="grid min-h-10 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
          <span className="min-w-0 truncate font-mono text-xs text-foreground/68">
            {props.readwiseRootPath.trim() || t('desktop.readwise.host.pathUnavailable')}
          </span>
          <AppButton onClick={props.onActivate} size="sm">
            {t('desktop.readwise.host.switch')}
          </AppButton>
        </div>
      </div>
    </section>
  );
}
