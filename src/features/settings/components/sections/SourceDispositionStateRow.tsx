import { RotateCcw } from 'lucide-react';

import type { RuntimeSourceDispositionSummary } from '../../../../shared/platform/settingsRuntimeRepository';
import {
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger,
  SETTINGS_ACTION_BUTTON_WIDTH_CLASS_NAME,
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  settingsButtonClassName,
  settingsResetButtonClassName
} from '../../../../shared/ui';

const SETTINGS_BUTTON_CLASS_NAME = settingsButtonClassName(SETTINGS_ACTION_BUTTON_WIDTH_CLASS_NAME);
const SETTINGS_RESET_BUTTON_CLASS_NAME = settingsResetButtonClassName('size-10');

function formatDispositionSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  return `${Math.max(1, Math.round(sizeBytes / (1024 * 1024)))} MB`;
}

function renderSourceStateDescription(statusMessage: string) {
  if (!statusMessage) {
    return 'Restore saved dismissed and deleted states for re-imported source topics.';
  }
  return <span className="text-foreground/80">{statusMessage}</span>;
}

export function SourceDispositionStateRow(props: {
  isDesktopRuntime: boolean;
  isRestoring: boolean;
  isResetting: boolean;
  onReset: () => void;
  onRestore: () => void;
  statusMessage: string;
  summary: RuntimeSourceDispositionSummary;
}) {
  const isDisabled = !props.isDesktopRuntime || props.isRestoring || props.isResetting || props.summary.recordCount === 0;
  const meta = `${props.summary.recordCount.toLocaleString()} records / ${formatDispositionSize(props.summary.sizeBytes)}`;
  return (
    <SettingsRow description={renderSourceStateDescription(props.statusMessage)} title="Restore source states">
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <div className="flex flex-nowrap items-center justify-end gap-2 max-[1080px]:flex-wrap max-[1080px]:justify-start">
          <span className="text-sm tabular-nums text-foreground/65">{meta}</span>
          <AppTooltip>
            <AppTooltipTrigger asChild>
              <button aria-label="Reset source states" className={SETTINGS_RESET_BUTTON_CLASS_NAME} disabled={isDisabled} onClick={props.onReset} type="button">
                <RotateCcw aria-hidden="true" size={18} strokeWidth={1.9} />
              </button>
            </AppTooltipTrigger>
            <AppTooltipContent align="end" side="top">
              Reset removes the saved dismissed and deleted source states. Current topics are not changed.
            </AppTooltipContent>
          </AppTooltip>
          <button aria-label="Restore source states" className={SETTINGS_BUTTON_CLASS_NAME} disabled={isDisabled} onClick={props.onRestore} type="button">
            {props.isRestoring ? 'Restoring…' : 'Restore'}
          </button>
        </div>
      </SettingsControlSlot>
    </SettingsRow>
  );
}
