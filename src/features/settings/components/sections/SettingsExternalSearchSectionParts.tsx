import { Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

import type { RuntimeExternalSearchFolder } from '../../../../shared/platform/externalSearchBridge';
import { resolveExternalSearchStatusLabel } from '../../../../shared/platform/externalSearchStatus';
import {
  AppStatusBadge,
  ObjectConfigPathButton,
  SETTINGS_ACTION_TABLE_EXTERNAL_LIBRARY_COLUMNS_CLASS_NAME,
  settingsActionTableAddButtonClassName,
  settingsActionTableClassName,
  settingsActionTableHeaderClassName,
  settingsActionTableRowClassName,
  settingsButtonClassName,
  settingsFieldClassName,
  settingsUtilityIconButtonClassName
} from '../../../../shared/ui';

type ExternalLibraryFolderUpdate = (
  folderId: string,
  patch: Partial<Pick<RuntimeExternalSearchFolder, 'attachmentRootPath' | 'excludedDirs' | 'folderPath'>>
) => void;

const EXTERNAL_LIBRARY_COLUMNS = SETTINGS_ACTION_TABLE_EXTERNAL_LIBRARY_COLUMNS_CLASS_NAME;
const EXTERNAL_LIBRARY_HEADERS = ['Folder', 'Attachment folder', 'Excluded folders', 'Status'];

function statusTone(folder: RuntimeExternalSearchFolder) {
  if (folder.status === 'ready') return 'success';
  if (folder.status === 'indexing') return 'info';
  if (folder.status === 'error') return 'error';
  return 'neutral';
}

function statusMeta(folder: RuntimeExternalSearchFolder) {
  if (folder.status === 'error') return folder.lastError ?? 'Index build failed.';
  if (folder.status === 'ready') return `${folder.documentCount} files indexed`;
  if (folder.status === 'indexing') return 'Updating in the background';
  return 'Waiting for the next background update';
}

function excludedFoldersValue(folders: string[]) {
  return folders.join(', ');
}

function UnavailableState() {
  return (
    <div className={settingsActionTableRowClassName(EXTERNAL_LIBRARY_COLUMNS)}>
      <p className="col-span-full text-sm text-foreground/60">External library is available in the desktop app.</p>
    </div>
  );
}

function ExternalLibraryHeader() {
  return (
    <div className={settingsActionTableHeaderClassName(EXTERNAL_LIBRARY_COLUMNS)}>
      {EXTERNAL_LIBRARY_HEADERS.map((label) => (
        <span key={label}>{label}</span>
      ))}
      <span className="text-right">Actions</span>
    </div>
  );
}

function ExternalLibraryStatus(props: { folder: RuntimeExternalSearchFolder }) {
  const meta = statusMeta(props.folder);

  return (
    <div className="min-w-0" title={meta}>
      <AppStatusBadge label={resolveExternalSearchStatusLabel(props.folder)} tone={statusTone(props.folder)} />
    </div>
  );
}

function ExternalLibraryPathButton(props: {
  disabled: boolean;
  emptyLabel: string;
  label: string;
  onClick: () => void;
  path: string;
}) {
  return (
    <ObjectConfigPathButton
      className="h-9 w-full px-2.5 text-sm"
      disabled={props.disabled}
      emptyLabel={props.emptyLabel}
      label={props.label}
      onClick={props.onClick}
      path={props.path}
    />
  );
}

function ExternalLibraryExcludedInput(props: {
  folder: RuntimeExternalSearchFolder;
  onUpdateFolder: ExternalLibraryFolderUpdate;
}) {
  return (
    <input
      className={settingsFieldClassName()}
      onChange={(event) =>
        props.onUpdateFolder(props.folder.id, {
          excludedDirs: event.target.value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        })
      }
      placeholder="Folder names to exclude, separated by commas"
      title={props.folder.excludedDirs.length > 0 ? props.folder.excludedDirs.join('\n') : undefined}
      value={excludedFoldersValue(props.folder.excludedDirs)}
    />
  );
}

function ExternalLibraryRowActions(props: {
  disabled: boolean;
  folderId: string;
  onRebuildIndex: (folderId?: string) => void;
  onRemoveFolder: (folderId: string) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <button
        aria-label="Index folder"
        className={settingsButtonClassName('h-9 px-3')}
        disabled={props.disabled}
        onClick={() => props.onRebuildIndex(props.folderId)}
        title="Rebuild this folder index"
        type="button"
      >
        Index
      </button>
      <button
        aria-label="Remove folder"
        className={settingsUtilityIconButtonClassName()}
        disabled={props.disabled}
        onClick={() => props.onRemoveFolder(props.folderId)}
        type="button"
      >
        <Trash2 aria-hidden="true" size={15} strokeWidth={1.8} />
      </button>
    </div>
  );
}

function ExternalLibraryDraftRow(props: { disabled: boolean; onAddFolder: () => void }) {
  return (
    <div className={settingsActionTableRowClassName(EXTERNAL_LIBRARY_COLUMNS)}>
      <ExternalLibraryPathButton
        disabled={props.disabled}
        emptyLabel="Choose folder"
        label="Choose folder"
        onClick={props.onAddFolder}
        path=""
      />
      <ExternalLibraryPathButton
        disabled
        emptyLabel="Not used"
        label="Choose attachment folder"
        onClick={props.onAddFolder}
        path=""
      />
      <input className={settingsFieldClassName()} disabled placeholder="Folder names to exclude, separated by commas" value="" readOnly />
      <div className="min-w-0 text-sm text-foreground/55">New folder</div>
      <div aria-hidden="true" />
    </div>
  );
}

function ExternalLibraryAddRow(props: { disabled: boolean; onAddFolder: () => void }) {
  return (
    <div className={settingsActionTableRowClassName(EXTERNAL_LIBRARY_COLUMNS, 'pb-3 pt-1')}>
      <button
        aria-label="Add folder"
        className={settingsActionTableAddButtonClassName()}
        disabled={props.disabled}
        onClick={props.onAddFolder}
        type="button"
      >
        <Plus aria-hidden="true" size={15} strokeWidth={1.9} />
        Add folder
      </button>
    </div>
  );
}

export function ExternalLibraryTable(props: {
  children: ReactNode;
  folders: RuntimeExternalSearchFolder[];
  isDesktopRuntime: boolean;
  isSaving: boolean;
  onAddFolder: () => void;
}) {
  return (
    <div className={settingsActionTableClassName()} role="table" aria-label="External source folders">
      <ExternalLibraryHeader />
      {props.isDesktopRuntime ? (
        <>
          {props.folders.length > 0 ? (
            props.children
          ) : (
            <ExternalLibraryDraftRow disabled={props.isSaving} onAddFolder={props.onAddFolder} />
          )}
          <ExternalLibraryAddRow disabled={props.isSaving} onAddFolder={props.onAddFolder} />
        </>
      ) : (
        <UnavailableState />
      )}
    </div>
  );
}

export function ExternalLibraryRow(props: {
  folder: RuntimeExternalSearchFolder;
  isSaving: boolean;
  onChooseAttachmentRoot: (folderId: string) => void;
  onChooseFolder: (folderId: string) => void;
  onRebuildIndex: (folderId?: string) => void;
  onRemoveFolder: (folderId: string) => void;
  onUpdateFolder: ExternalLibraryFolderUpdate;
}) {
  return (
    <div className={settingsActionTableRowClassName(EXTERNAL_LIBRARY_COLUMNS)}>
      <ExternalLibraryPathButton
        disabled={props.isSaving}
        emptyLabel="Choose folder"
        label="Choose folder"
        onClick={() => void props.onChooseFolder(props.folder.id)}
        path={props.folder.folderPath}
      />
      <ExternalLibraryPathButton
        disabled={props.isSaving}
        emptyLabel="Choose folder"
        label="Choose attachment folder"
        onClick={() => void props.onChooseAttachmentRoot(props.folder.id)}
        path={props.folder.attachmentRootPath ?? ''}
      />
      <ExternalLibraryExcludedInput folder={props.folder} onUpdateFolder={props.onUpdateFolder} />
      <ExternalLibraryStatus folder={props.folder} />
      <ExternalLibraryRowActions
        disabled={props.isSaving}
        folderId={props.folder.id}
        onRebuildIndex={props.onRebuildIndex}
        onRemoveFolder={props.onRemoveFolder}
      />
    </div>
  );
}
