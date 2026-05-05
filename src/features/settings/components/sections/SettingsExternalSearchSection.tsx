import { RefreshCw, X } from 'lucide-react';

import type { RuntimeExternalSearchFolder } from '../../../../shared/platform/externalSearchBridge';
import {
  AppButton,
  AppIconButton,
  AppInput,
  AppStatusBadge,
  ObjectConfigHeader,
  ObjectConfigPathButton,
  ObjectConfigRow,
  ObjectConfigTable,
  SettingsSection
} from '../../../../shared/ui';

interface SettingsExternalSearchSectionProps {
  error: string | null;
  feedback: string | null;
  folders: RuntimeExternalSearchFolder[];
  isDesktopRuntime: boolean;
  isSaving: boolean;
  onAddFolder: () => void;
  onChooseAttachmentRoot: (folderId: string) => void;
  onChooseFolder: (folderId: string) => void;
  onRebuildIndex: (folderId?: string) => void;
  onRemoveFolder: (folderId: string) => void;
  onUpdateFolder: (
    folderId: string,
    patch: Partial<Pick<RuntimeExternalSearchFolder, 'attachmentRootPath' | 'excludedDirs' | 'folderPath'>>
  ) => void;
}

const OBJECT_CONFIG_COLUMNS =
  'grid-cols-[minmax(0,1.75fr)_minmax(0,1.75fr)_minmax(0,1.45fr)_minmax(0,0.95fr)_72px]';

const OBJECT_CONFIG_HEADERS = [
  { label: 'Folder' },
  { label: 'Attachment folder' },
  { label: 'Excluded folders' },
  { label: 'Status' },
  { align: 'right' as const, label: 'Actions' }
];

function statusTone(folder: RuntimeExternalSearchFolder) {
  if (folder.status === 'ready') return 'success';
  if (folder.status === 'indexing') return 'info';
  if (folder.status === 'error') return 'error';
  return 'neutral';
}

function statusLabel(folder: RuntimeExternalSearchFolder) {
  if (folder.status === 'ready') return 'Ready';
  if (folder.status === 'indexing') return 'Indexing';
  if (folder.status === 'error') return 'Error';
  return 'Not indexed';
}

function statusMeta(folder: RuntimeExternalSearchFolder) {
  if (folder.status === 'error') return folder.lastError ?? 'Index build failed.';
  if (folder.status === 'ready') return `${folder.documentCount} files indexed`;
  return 'Waiting for index build';
}

function excludedFoldersValue(folders: string[]) {
  return folders.join(', ');
}

function ExternalLibraryActions(props: {
  disabled: boolean;
  hasFolders: boolean;
  onAddFolder: () => void;
  onRebuildIndex: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <AppButton disabled={props.disabled} onClick={props.onAddFolder}>
        Add folder
      </AppButton>
      <AppButton disabled={props.disabled || !props.hasFolders} onClick={props.onRebuildIndex} variant="ghost">
        Rebuild all
      </AppButton>
    </div>
  );
}

function EmptyState(props: { isDesktopRuntime: boolean }) {
  if (!props.isDesktopRuntime) {
    return <p className="py-3 text-sm text-foreground/60">External library is available in the desktop app.</p>;
  }
  return <p className="py-3 text-sm text-foreground/60">No folders yet.</p>;
}

function ExternalLibraryRow(props: {
  folder: RuntimeExternalSearchFolder;
  isSaving: boolean;
  onChooseAttachmentRoot: (folderId: string) => void;
  onChooseFolder: (folderId: string) => void;
  onRebuildIndex: (folderId?: string) => void;
  onRemoveFolder: (folderId: string) => void;
  onUpdateFolder: SettingsExternalSearchSectionProps['onUpdateFolder'];
}) {
  return (
    <ObjectConfigRow columnsClassName={OBJECT_CONFIG_COLUMNS}>
      <ObjectConfigPathButton
        disabled={props.isSaving}
        emptyLabel="Choose folder"
        label="Choose folder"
        onClick={() => void props.onChooseFolder(props.folder.id)}
        path={props.folder.folderPath}
      />
      <ObjectConfigPathButton
        disabled={props.isSaving}
        emptyLabel="Choose folder"
        label="Choose attachment folder"
        onClick={() => void props.onChooseAttachmentRoot(props.folder.id)}
        path={props.folder.attachmentRootPath ?? ''}
      />
      <AppInput
        onChange={(event) =>
          props.onUpdateFolder(props.folder.id, {
            excludedDirs: event.target.value
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean)
          })
        }
        placeholder=".obsidian, node_modules"
        title={props.folder.excludedDirs.length > 0 ? props.folder.excludedDirs.join('\n') : undefined}
        value={excludedFoldersValue(props.folder.excludedDirs)}
      />
      <div className="space-y-2 pt-1">
        <AppStatusBadge label={statusLabel(props.folder)} tone={statusTone(props.folder)} />
        <p className="text-xs text-foreground/60">{statusMeta(props.folder)}</p>
      </div>
      <div className="flex items-start justify-end gap-1 pt-1">
        <AppIconButton
          disabled={props.isSaving}
          icon={<RefreshCw aria-hidden="true" size={15} strokeWidth={2} />}
          label="Rebuild index"
          onClick={() => props.onRebuildIndex(props.folder.id)}
        />
        <AppIconButton
          disabled={props.isSaving}
          icon={<X aria-hidden="true" size={15} strokeWidth={2.1} />}
          label="Remove folder"
          onClick={() => props.onRemoveFolder(props.folder.id)}
        />
      </div>
    </ObjectConfigRow>
  );
}

export function SettingsExternalSearchSection(props: SettingsExternalSearchSectionProps) {
  return (
    <SettingsSection
      actions={
        <ExternalLibraryActions
          disabled={!props.isDesktopRuntime || props.isSaving}
          hasFolders={props.folders.length > 0}
          onAddFolder={props.onAddFolder}
          onRebuildIndex={() => props.onRebuildIndex()}
        />
      }
      ariaLabel="External library section"
      description="Search, preview, and import content from folders that stay outside Foliole until you choose to import it."
      title="External library"
    >
      <ObjectConfigTable>
        <ObjectConfigHeader columns={OBJECT_CONFIG_HEADERS} columnsClassName={OBJECT_CONFIG_COLUMNS} />
        {props.folders.length === 0 ? (
          <EmptyState isDesktopRuntime={props.isDesktopRuntime} />
        ) : (
          props.folders.map((folder) => (
            <ExternalLibraryRow
              folder={folder}
              isSaving={props.isSaving}
              key={folder.id}
              onChooseAttachmentRoot={props.onChooseAttachmentRoot}
              onChooseFolder={props.onChooseFolder}
              onRebuildIndex={props.onRebuildIndex}
              onRemoveFolder={props.onRemoveFolder}
              onUpdateFolder={props.onUpdateFolder}
            />
          ))
        )}
      </ObjectConfigTable>
      {props.feedback ? <p className="text-sm text-foreground/70">{props.feedback}</p> : null}
      {props.error ? <p className="text-sm text-red-700">{props.error}</p> : null}
    </SettingsSection>
  );
}
