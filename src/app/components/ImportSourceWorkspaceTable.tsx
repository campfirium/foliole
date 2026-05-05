import { Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { importActionOptions } from '../../../lib/core/import/importSourceActions';
import { cn } from '../../shared/lib/utils';
import {
  AppButton,
  SETTINGS_ACTION_TABLE_IMPORT_SOURCE_COLUMNS_CLASS_NAME,
  settingsActionTableAddButtonClassName,
  settingsActionTableClassName,
  settingsActionTableHeaderClassName,
  settingsActionTableRowClassName
} from '../../shared/ui';

import { type DraftImportSource, type DraftImportSourceField, formatHighlightModeLabel, formatKeepStateLabel, importSourceSelectClassName } from './importSourceWorkspaceModel';
import { FolderButton, resolveFolderPathHint, resolveFolderPathLabel } from './ImportSourceWorkspaceTableParts';

const TABLE_COLUMNS = SETTINGS_ACTION_TABLE_IMPORT_SOURCE_COLUMNS_CLASS_NAME;

function TableHeader() {
  return (
    <div className={settingsActionTableHeaderClassName(TABLE_COLUMNS)}>
      <span>Original</span>
      <span>Highlight</span>
      <span>Mode</span>
      <span>Handling</span>
      <span>Preview</span>
      <span className="text-right">Action</span>
    </div>
  );
}

function SourceSelect(props: {
  ariaLabel: string;
  children: ReactNode;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <select
      aria-label={props.ariaLabel}
      className={cn(importSourceSelectClassName, 'h-9 min-w-0 rounded-md px-2.5 text-sm')}
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
  if (props.source.keepState === 'enabled') {
    return (
      <AppButton
        aria-label={`Disable keep import ${props.source.id}`}
        className="h-9 w-full min-w-0 px-2.5 text-sm"
        onClick={() => props.onDisableKeepImport(props.source.id)}
        variant="primary"
      >
        Enabled
      </AppButton>
    );
  }

  return (
    <AppButton
      aria-label={`Preview ${props.source.id}`}
      className="h-9 w-full min-w-0 px-2.5 text-sm"
      disabled={!props.source.primaryPath.trim()}
      onClick={() => props.onPreviewKeepImport(props.source.id)}
      title={formatKeepStateLabel(props.source.keepState)}
      variant="primary"
    >
      Preview
    </AppButton>
  );
}

function SourceActions(props: {
  source: DraftImportSource;
  onDeleteSource: (sourceId: string) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <AppButton aria-label={`Delete ${props.source.id}`} className="size-9 px-0 text-settings-icon hover:text-settings-icon-hover" onClick={() => props.onDeleteSource(props.source.id)} variant="ghost">
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
  return (
    <>
      <FolderButton
        label={`Original folder ${props.source.id}`}
        onClick={() => props.onChoosePrimaryFolder(props.source.id)}
        path={resolveFolderPathLabel(props.source.primaryPath, 'Choose')}
        tooltip={resolveFolderPathHint(props.source.primaryPath)}
        className="h-9 px-2.5 text-sm"
      />
      <FolderButton
        label={`Highlight folder ${props.source.id}`}
        disabled={props.source.highlightMode !== 'split'}
        onClick={() => props.onChooseHighlightFolder(props.source.id)}
        path={resolveFolderPathLabel(
          props.source.highlightPath,
          props.source.highlightMode === 'split' ? 'Choose' : 'Not used'
        )}
        tooltip={resolveFolderPathHint(props.source.highlightPath)}
        className="h-9 px-2.5 text-sm"
      />
    </>
  );
}

function SourceRow({
  source,
  onChange,
  onChoosePrimaryFolder,
  onChooseHighlightFolder,
  onChangeAction,
  onDisableKeepImport,
  onDeleteSource,
  onPreviewKeepImport
}: {
  source: DraftImportSource;
  onChange: (sourceId: string, field: DraftImportSourceField, value: string) => void;
  onChoosePrimaryFolder: (sourceId: string) => void;
  onChooseHighlightFolder: (sourceId: string) => void;
  onChangeAction: (sourceId: string, value: string) => void;
  onDisableKeepImport: (sourceId: string) => void;
  onDeleteSource: (sourceId: string) => void;
  onPreviewKeepImport: (sourceId: string) => void;
}) {
  return (
    <div className={settingsActionTableRowClassName(TABLE_COLUMNS)}>
      <SourceFolderCells
        onChooseHighlightFolder={onChooseHighlightFolder}
        onChoosePrimaryFolder={onChoosePrimaryFolder}
        source={source}
      />
      <SourceSelect
        ariaLabel={`Mode ${source.id}`}
        onChange={(value) => onChange(source.id, 'highlightMode', value)}
        value={source.highlightMode}
      >
        <option value="merged">{formatHighlightModeLabel('merged')}</option>
        <option value="split">{formatHighlightModeLabel('split')}</option>
      </SourceSelect>
      <SourceSelect
        ariaLabel={`Handling ${source.id}`}
        onChange={(value) => onChangeAction(source.id, value)}
        value={source.actionMode}
      >
        {importActionOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SourceSelect>
      <PreviewCell onDisableKeepImport={onDisableKeepImport} onPreviewKeepImport={onPreviewKeepImport} source={source} />
      <SourceActions onDeleteSource={onDeleteSource} source={source} />
    </div>
  );
}

function AddSourceRow(props: { disabled: boolean; onAddSource: () => void }) {
  return (
    <div className={settingsActionTableRowClassName(TABLE_COLUMNS, 'pb-3 pt-1')}>
      <button
        aria-label="Add source"
        className={settingsActionTableAddButtonClassName()}
        disabled={props.disabled}
        onClick={props.onAddSource}
        type="button"
      >
        <Plus aria-hidden="true" size={15} strokeWidth={1.9} />
        Add source
      </button>
    </div>
  );
}

export function ImportSourceTable({
  sources,
  onAddSource,
  onChange,
  onChoosePrimaryFolder,
  onChooseHighlightFolder,
  onChangeAction,
  onDisableKeepImport,
  onDeleteSource,
  onPreviewKeepImport
}: {
  sources: DraftImportSource[];
  onAddSource: () => void;
  onChange: (sourceId: string, field: DraftImportSourceField, value: string) => void;
  onChoosePrimaryFolder: (sourceId: string) => void;
  onChooseHighlightFolder: (sourceId: string) => void;
  onChangeAction: (sourceId: string, value: string) => void;
  onDisableKeepImport: (sourceId: string) => void;
  onDeleteSource: (sourceId: string) => void;
  onPreviewKeepImport: (sourceId: string) => void;
}) {
  return (
    <div className={settingsActionTableClassName()} role="table" aria-label="Import source folders">
      <TableHeader />
      {sources.map((source) => (
        <SourceRow
          key={source.id}
          onChange={onChange}
          onChangeAction={onChangeAction}
          onChooseHighlightFolder={onChooseHighlightFolder}
          onChoosePrimaryFolder={onChoosePrimaryFolder}
          onDisableKeepImport={onDisableKeepImport}
          onDeleteSource={onDeleteSource}
          onPreviewKeepImport={onPreviewKeepImport}
          source={source}
        />
      ))}
      <AddSourceRow disabled={sources.length === 0} onAddSource={onAddSource} />
    </div>
  );
}
