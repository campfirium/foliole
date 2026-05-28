import { Download, Trash2, Upload } from 'lucide-react';

import type { RuntimeSourceDispositionSummary } from '../../../../shared/platform/settingsRuntimeRepository';
import {
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger,
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  settingsUtilityIconButtonClassName
} from '../../../../shared/ui';

const SOURCE_HANDLING_ICON_BUTTON_CLASS_NAME = settingsUtilityIconButtonClassName(false, 'size-11 rounded-lg');

function formatDispositionSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  return `${Math.max(1, Math.round(sizeBytes / (1024 * 1024)))} MB`;
}

function renderSourceStateDescription(statusMessage: string, summary: RuntimeSourceDispositionSummary) {
  const meta = `${summary.recordCount.toLocaleString()} entries / ${formatDispositionSize(summary.sizeBytes)}`;
  if (!statusMessage) {
    return (
      <>
        <span className="block">Keeps dismissed and deleted states for source topics from watched folders and Readwise Reader sources, so reconnecting or resyncing those sources does not bring handled topics back as active.</span>
        <span className="mt-2 block text-foreground/58">{meta}</span>
      </>
    );
  }
  return (
    <>
      <span className="block text-foreground/80">{statusMessage}</span>
      <span className="mt-2 block text-foreground/58">{meta}</span>
    </>
  );
}

function SourceHandlingIconButton(props: {
  disabled: boolean;
  icon: typeof Download;
  label: string;
  loadingLabel?: string | undefined;
  onClick: () => void;
  tooltip: string;
}) {
  const Icon = props.icon;
  const tooltipText = props.loadingLabel ?? props.tooltip;
  return (
    <AppTooltip>
      <AppTooltipTrigger asChild>
        <span className="inline-flex" tabIndex={props.disabled ? 0 : undefined} title={tooltipText}>
          <button aria-label={props.label} className={SOURCE_HANDLING_ICON_BUTTON_CLASS_NAME} disabled={props.disabled} onClick={props.onClick} type="button">
            <Icon aria-hidden="true" size={22} strokeWidth={1.8} />
          </button>
        </span>
      </AppTooltipTrigger>
      <AppTooltipContent align="end" side="top">
        {tooltipText}
      </AppTooltipContent>
    </AppTooltip>
  );
}

export function SourceDispositionStateRow(props: {
  isDesktopRuntime: boolean;
  isExporting: boolean;
  isImporting: boolean;
  isResetting: boolean;
  onExport: () => void;
  onImport: () => void;
  onReset: () => void;
  statusMessage: string;
  summary: RuntimeSourceDispositionSummary;
}) {
  const isBusy = props.isExporting || props.isImporting || props.isResetting;
  const hasEntries = props.summary.recordCount > 0;
  const isEntryActionDisabled = !props.isDesktopRuntime || isBusy || !hasEntries;
  const isImportDisabled = !props.isDesktopRuntime || isBusy;
  return (
    <SettingsRow description={renderSourceStateDescription(props.statusMessage, props.summary)} title="Saved source topic handling">
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <div className="flex flex-nowrap items-center justify-end gap-2 max-[1080px]:justify-start">
          <SourceHandlingIconButton disabled={isImportDisabled} icon={Download} label="Import saved source topic handling" loadingLabel={props.isImporting ? 'Importing…' : undefined} onClick={props.onImport} tooltip="Import saved source topic handling" />
          <SourceHandlingIconButton disabled={isEntryActionDisabled} icon={Upload} label="Export saved source topic handling" loadingLabel={props.isExporting ? 'Exporting…' : undefined} onClick={props.onExport} tooltip="Export saved source topic handling" />
          <SourceHandlingIconButton disabled={isEntryActionDisabled} icon={Trash2} label="Clear saved source topic handling" loadingLabel={props.isResetting ? 'Clearing…' : undefined} onClick={props.onReset} tooltip="Clear saved handling" />
        </div>
      </SettingsControlSlot>
    </SettingsRow>
  );
}
