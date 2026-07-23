import { Download, LoaderCircle, Trash2, Upload } from 'lucide-react';

import { useTranslation, type Translate } from '../../../../shared/localization/LocalizationProvider';
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

function renderSourceStateDescription(statusMessage: string, summary: RuntimeSourceDispositionSummary, t: Translate) {
  const meta = t('settings.backups.sourceHandling.meta', {
    count: summary.recordCount.toLocaleString(),
    size: formatDispositionSize(summary.sizeBytes)
  });
  if (!statusMessage) {
    return (
      <>
        <span className="block">{t('settings.backups.sourceHandling.description')}</span>
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
  loading?: boolean;
  onClick: () => void;
  tooltip: string;
}) {
  const Icon = props.icon;
  const tooltipText = props.tooltip;
  return (
    <AppTooltip>
      <AppTooltipTrigger asChild>
        <span className="inline-flex" tabIndex={props.disabled ? 0 : undefined} title={tooltipText}>
          <button aria-busy={props.loading || undefined} aria-label={props.label} className={SOURCE_HANDLING_ICON_BUTTON_CLASS_NAME} disabled={props.disabled || props.loading} onClick={props.onClick} type="button">
            {props.loading ? <LoaderCircle aria-hidden="true" className="animate-spin" size={22} strokeWidth={1.8} /> : <Icon aria-hidden="true" size={22} strokeWidth={1.8} />}
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
  const t = useTranslation();
  const isBusy = props.isExporting || props.isImporting || props.isResetting;
  const hasEntries = props.summary.recordCount > 0;
  const isEntryActionDisabled = !props.isDesktopRuntime || isBusy || !hasEntries;
  const isImportDisabled = !props.isDesktopRuntime || isBusy;
  return (
    <SettingsRow description={renderSourceStateDescription(props.statusMessage, props.summary, t)} title={t('settings.backups.sourceHandling.savedTitle')}>
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <div className="flex flex-nowrap items-center justify-end gap-2 max-[1080px]:justify-start">
          <SourceHandlingIconButton disabled={isImportDisabled} icon={Download} label={t('settings.backups.sourceHandling.import')} loading={props.isImporting} onClick={props.onImport} tooltip={t('settings.backups.sourceHandling.import')} />
          <SourceHandlingIconButton disabled={isEntryActionDisabled} icon={Upload} label={t('settings.backups.sourceHandling.export')} loading={props.isExporting} onClick={props.onExport} tooltip={t('settings.backups.sourceHandling.export')} />
          <SourceHandlingIconButton disabled={isEntryActionDisabled} icon={Trash2} label={t('settings.backups.sourceHandling.clear')} loading={props.isResetting} onClick={props.onReset} tooltip={t('settings.backups.sourceHandling.clearShort')} />
        </div>
      </SettingsControlSlot>
    </SettingsRow>
  );
}
