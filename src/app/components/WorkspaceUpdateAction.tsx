import { Download, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  installDesktopUpdate,
  readDesktopUpdateState,
  subscribeDesktopUpdateState
} from '../../shared/platform/desktopUpdate';
import { ToolbarActionGroup } from '../../shared/ui';

import {
  WORKSPACE_RAIL_BUTTON_FOCUS_CLASS_NAME,
  WorkspaceRailTooltipButton
} from './WorkspaceRailTooltipButton';
import './WorkspaceUpdateAction.css';

const UPDATE_REMINDER_INTERVAL_MS = 60 * 1000;
const UPDATE_BUTTON_CLASS_NAME =
  `workspace-update-action workspace-update-action-nudge ${WORKSPACE_RAIL_BUTTON_FOCUS_CLASS_NAME}`;

export function WorkspaceUpdateAction() {
  const t = useTranslation();
  const [state, setState] = useState(readDesktopUpdateState);
  const [nudgeSequence, setNudgeSequence] = useState(0);

  useEffect(() => subscribeDesktopUpdateState(() => setState(readDesktopUpdateState())), []);
  useEffect(() => {
    if (state.phase !== 'ready') return undefined;
    const interval = window.setInterval(
      () => setNudgeSequence((sequence) => sequence + 1),
      UPDATE_REMINDER_INTERVAL_MS
    );
    return () => window.clearInterval(interval);
  }, [state.phase, state.version]);
  if (state.phase !== 'ready' && state.phase !== 'restarting') return null;

  const restarting = state.phase === 'restarting';
  const restartFailed = state.phase === 'ready' && state.errorCode?.startsWith('install-');
  const label = t(restarting
    ? 'desktop.workspace.restarting'
    : restartFailed ? 'desktop.workspace.restartFailed' : 'desktop.workspace.restartAndUpdate');
  return (
    <ToolbarActionGroup ariaLabel={label} className="w-full gap-0" fullWidth orientation="vertical">
      <div className="flex h-[var(--workspace-top-toolbar-height)] w-full items-center justify-center">
        <WorkspaceRailTooltipButton
          className={UPDATE_BUTTON_CLASS_NAME}
          data-nudge-sequence={nudgeSequence}
          disabled={restarting}
          forceTooltipOpen={restarting}
          icon={restarting
            ? <LoaderCircle aria-hidden="true" className="animate-spin" size={18} strokeWidth={1.75} />
            : <Download aria-hidden="true" size={18} strokeWidth={2} />}
          key={`${state.version ?? 'ready'}-${nudgeSequence}`}
          label={label}
          onClick={restarting ? undefined : () => void installDesktopUpdate()}
        />
      </div>
    </ToolbarActionGroup>
  );
}
