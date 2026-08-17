import { Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { importActionOptions } from '../../../lib/core/import/importSourceActions';
import { isGenericSplitImportSourceUnsupported } from '../../../lib/core/import/unsupportedKeepImportRules';
import { definedProps } from '../../shared/lib/definedProps';
import { cn } from '../../shared/lib/utils';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppButton,
  SETTINGS_ACTION_TABLE_IMPORT_SOURCE_COLUMNS_CLASS_NAME,
  settingsActionTableAddButtonClassName,
  settingsActionTableRowClassName
} from '../../shared/ui';

import { type DraftImportSource, type DraftImportSourceField, importSourceSelectClassName } from './importSourceWorkspaceModel';
import { FolderButton, resolveFolderPathHint, resolveFolderPathLabel } from './ImportSourceWorkspaceTableParts';

const TABLE_COLUMNS = SETTINGS_ACTION_TABLE_IMPORT_SOURCE_COLUMNS_CLASS_NAME;

function formatHighlightModeLabel(mode: DraftImportSource['highlightMode'], t: ReturnType<typeof useTranslation>) {
  return t(mode === 'split' ? 'desktop.importSource.mode.split' : 'desktop.importSource.mode.merged');
}

function formatKeepStateLabel(state: DraftImportSource['keepState'], t: ReturnType<typeof useTranslation>) {
  if (state === 'enabled') return t('desktop.importSource.enabled');
  if (state === 'previewed') return t('desktop.importSource.readyToEnable');
  return t('desktop.importSource.needsPreview');
}

export interface ImportSourceTableRowActions {
  onChange: (sourceId: string, field: DraftImportSourceField, value: string) => void;
  onClaimSource: (sourceId: string) => void;
  onChangeAction: (sourceId: string, value: string) => void;
  onChooseHighlightFolder: (sourceId: string) => void;
  onChoosePrimaryFolder: (sourceId: string) => void;
  onDeleteSource: (sourceId: string) => void;
  onDisableKeepImport: (sourceId: string) => void;
  onPreviewKeepImport: (sourceId: string) => void;
}

function SourceSelect(props: {
  ariaLabel: string;
  children: ReactNode;
  onChange: (value: string) => void;
  value: string;
  disabled?: boolean;
}) {
  return (
    <select
      aria-label={props.ariaLabel}
      className={cn(importSourceSelectClassName, 'h-9 min-w-0 rounded-md px-2.5 text-sm')}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.target.value)}
      value={props.value}
    >
      {props.children}
    </select>
  );
}

function PreviewCell(props: {
  source: DraftImportSource;
  onDisableKeepImport: (sourceId: string) => void;
  onPreviewKeepImport: (sourceId: string) => void;
}) {
  const t = useTranslation();
  const unsupportedSplit = isGenericSplitImportSourceUnsupported(props.source);
  const readOnly = props.source.ownership?.editable === false;
  const missingPath = !props.source.primaryPath.trim() || (props.source.highlightMode === 'split' && !props.source.highlightPath.trim());
  if (props.source.keepState === 'enabled') {
    return (
      <AppButton
        aria-label={t('desktop.importSource.disableKeep', { id: props.source.id })}
        className="h-9 w-full min-w-0 px-2.5 text-sm"
        disabled={readOnly}
        onClick={() => props.onDisableKeepImport(props.source.id)}
        variant="default"
      >
        {t('desktop.importSource.enabled')}
      </AppButton>
    );
  }

  return (
    <AppButton
      aria-label={`${t('desktop.importSource.preview')} ${props.source.id}`}
      className="h-9 w-full min-w-0 px-2.5 text-sm"
      disabled={readOnly || missingPath || unsupportedSplit}
      onClick={() => props.onPreviewKeepImport(props.source.id)}
      title={unsupportedSplit ? t('desktop.importSource.unsupportedSplit') : formatKeepStateLabel(props.source.keepState, t)}
      variant="default"
    >
      {unsupportedSplit ? t('desktop.importSource.unavailable') : t('desktop.importSource.preview')}
    </AppButton>
  );
}

function HandlingCell(props: {
  source: DraftImportSource;
  onChangeAction: (sourceId: string, value: string) => void;
}) {
  const t = useTranslation();
  return (
    <div className="min-w-0">
      <SourceSelect
        ariaLabel={`${t('desktop.importSource.table.handling')} ${props.source.id}`}
        onChange={(value) => props.onChangeAction(props.source.id, value)}
        disabled={props.source.ownership?.editable === false}
        value={props.source.actionMode}
      >
        {importActionOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.value === 'delete' ? t('desktop.readwise.cleanup.delete') : t('desktop.readwise.cleanup.keep')}
          </option>
        ))}
      </SourceSelect>
    </div>
  );
}

function SourceActions(props: {
  source: DraftImportSource;
  onClaimSource: (sourceId: string) => void;
  onDeleteSource: (sourceId: string) => void;
}) {
  const t = useTranslation();
  if (props.source.ownership?.ownerInstallationId === null) {
    return (
      <AppButton className="h-9 px-2 text-xs" onClick={() => props.onClaimSource(props.source.id)} variant="default">
        {t('desktop.importSource.claim')}
      </AppButton>
    );
  }
  if (props.source.ownership?.editable === false) {
    return <span className="truncate text-xs text-settings-muted" title={props.source.ownership.ownerDeviceName ?? ''}>
      {props.source.ownership.ownerDeviceName ?? t('desktop.importSource.remoteDevice')}
    </span>;
  }
  return (
    <div className="flex items-center justify-end gap-1">
      <AppButton aria-label={t('desktop.importSource.delete', { id: props.source.id })} className="size-9 px-0 text-settings-icon hover:text-settings-icon-hover" onClick={() => props.onDeleteSource(props.source.id)} variant="ghost">
        <Trash2 aria-hidden="true" size={15} strokeWidth={1.8} />
      </AppButton>
    </div>
  );
}

function SourceFolderCells(props: {
  source: DraftImportSource;
  onChoosePrimaryFolder: (sourceId: string) => void;
  onChooseHighlightFolder: (sourceId: string) => void;
}) {
  const t = useTranslation();
  return (
    <>
      <FolderButton
        label={t('desktop.importSource.folder.original', { id: props.source.id })}
        onClick={() => props.onChoosePrimaryFolder(props.source.id)}
        disabled={props.source.ownership?.editable === false}
        path={resolveFolderPathLabel(props.source.primaryPath, t('desktop.importSource.folder.choose'))}
        {...definedProps({ tooltip: resolveFolderPathHint(props.source.primaryPath) })}
        className="h-9 px-2.5 text-sm"
      />
      <FolderButton
        label={t('desktop.importSource.folder.highlight', { id: props.source.id })}
        disabled={props.source.highlightMode !== 'split' || props.source.ownership?.editable === false}
        onClick={() => props.onChooseHighlightFolder(props.source.id)}
        path={resolveFolderPathLabel(
          props.source.highlightPath,
          props.source.highlightMode === 'split' ? t('desktop.importSource.folder.choose') : t('desktop.importSource.folder.notUsed')
        )}
        {...definedProps({ tooltip: resolveFolderPathHint(props.source.highlightPath) })}
        className="h-9 px-2.5 text-sm"
      />
    </>
  );
}

export function SourceRow({
  source,
  onChange,
  onClaimSource,
  onChoosePrimaryFolder,
  onChooseHighlightFolder,
  onChangeAction,
  onDisableKeepImport,
  onDeleteSource,
  onPreviewKeepImport
}: ImportSourceTableRowActions & {
  source: DraftImportSource;
}) {
  const t = useTranslation();
  return (
    <div className={settingsActionTableRowClassName(TABLE_COLUMNS)}>
      <SourceFolderCells
        onChooseHighlightFolder={onChooseHighlightFolder}
        onChoosePrimaryFolder={onChoosePrimaryFolder}
        source={source}
      />
      <SourceSelect
        ariaLabel={`${t('desktop.importSource.table.mode')} ${source.id}`}
        onChange={(value) => onChange(source.id, 'highlightMode', value)}
        disabled={source.ownership?.editable === false}
        value={source.highlightMode}
      >
        <option value="merged">{formatHighlightModeLabel('merged', t)}</option>
        <option value="split">{formatHighlightModeLabel('split', t)}</option>
        </SourceSelect>
      <HandlingCell onChangeAction={onChangeAction} source={source} />
      <PreviewCell onDisableKeepImport={onDisableKeepImport} onPreviewKeepImport={onPreviewKeepImport} source={source} />
      <SourceActions onClaimSource={onClaimSource} onDeleteSource={onDeleteSource} source={source} />
    </div>
  );
}

export function AddSourceRow(props: { onAddSource: () => void }) {
  const t = useTranslation();
  return (
    <div className={settingsActionTableRowClassName(TABLE_COLUMNS, 'pb-3 pt-1')}>
      <button
        aria-label={t('desktop.importSource.add')}
        className={settingsActionTableAddButtonClassName()}
        onClick={props.onAddSource}
        type="button"
      >
        <Plus aria-hidden="true" size={15} strokeWidth={1.9} />
        {t('desktop.importSource.add')}
      </button>
    </div>
  );
}
