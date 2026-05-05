import { useEffect, useState } from 'react';

import type { NativeTextImportResult } from '../../../lib/platform/nativeImportContract';
import { MarkdownEditor } from '../../features/editor/components/MarkdownEditor';
import {
  importRuntimeExternalSearchDocument,
  loadRuntimeExternalSearchPreview,
  type RuntimeExternalSearchFolder,
  type RuntimeExternalSearchPreview
} from '../../shared/platform/externalSearchBridge';
import { AppButton, AppEmptyState } from '../../shared/ui';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { resolveExternalFolderLabel, type ExternalLibrarySelection } from './externalLibraryBrowseModel';

interface ExternalLibraryDocumentSurfaceProps {
  folders: RuntimeExternalSearchFolder[];
  onOpenImportedNode: (result: NativeTextImportResult) => void;
  selection: ExternalLibrarySelection;
}

function useExternalSearchPreview(selection: ExternalLibrarySelection) {
  const [preview, setPreview] = useState<RuntimeExternalSearchPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selection.kind !== 'document') {
      setPreview(null);
      setError(null);
      return;
    }
    let alive = true;
    void loadRuntimeExternalSearchPreview(selection.absolutePath)
      .then((result) => {
        if (!alive) {
          return;
        }
        setPreview(result);
        setError(result ? null : 'Could not load external document preview.');
      })
      .catch((nextError) => {
        if (!alive) {
          return;
        }
        setPreview(null);
        setError(nextError instanceof Error ? nextError.message : 'Could not load external document preview.');
      });
    return () => {
      alive = false;
    };
  }, [selection]);

  return { error, preview };
}

export function ExternalLibraryDocumentSurface(props: ExternalLibraryDocumentSurfaceProps) {
  const { error, preview } = useExternalSearchPreview(props.selection);
  const [isImporting, setIsImporting] = useState(false);
  const activeFolderId = props.selection.kind === 'root' ? null : props.selection.folderId;
  const selectedFolder = activeFolderId
    ? props.folders.find((folder) => folder.id === activeFolderId) ?? null
    : null;

  async function handleImport() {
    if (!preview) {
      return;
    }
    setIsImporting(true);
    try {
      const result = await importRuntimeExternalSearchDocument(preview.absolutePath);
      if (!result?.node_id) {
        return;
      }
      await useWorkspaceStore.persist.rehydrate();
      props.onOpenImportedNode(result);
    } finally {
      setIsImporting(false);
    }
  }

  if (props.selection.kind !== 'document' || !preview) {
    return (
      <section aria-label="Document area" className="flex min-h-0 flex-1 items-center justify-center bg-canvas px-6">
        <AppEmptyState
          description={resolveExternalSurfaceDescription(props.selection, selectedFolder, error)}
          title={resolveExternalSurfaceTitle(props.selection, selectedFolder)}
        />
      </section>
    );
  }

  return (
    <section aria-label="Document area" className="flex min-h-0 flex-1 flex-col bg-canvas">
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-foreground">{preview.fileName}</div>
          <div className="mt-1 break-all text-sm text-foreground/60">{preview.relativePath}</div>
        </div>
        <AppButton disabled={isImporting} onClick={() => void handleImport()}>
          Import
        </AppButton>
      </div>
      <div className="min-h-0 flex-1">
        <MarkdownEditor
          blockImageMaxHeightOverride={520}
          blockImageWidthOverride="min(100%, 40rem)"
          className="h-full"
          nodeId={preview.absolutePath}
          onChange={() => undefined}
          readOnly
          value={preview.content}
        />
      </div>
    </section>
  );
}

function resolveExternalSurfaceTitle(
  selection: ExternalLibrarySelection,
  selectedFolder: RuntimeExternalSearchFolder | null
) {
  if (selection.kind === 'root') {
    return 'External library';
  }
  if (selection.kind === 'folder') {
    return selectedFolder ? resolveExternalFolderLabel(selectedFolder.folderPath) : 'External folder';
  }
  if (selection.kind === 'directory') {
    return selection.directoryPath.split('/').filter(Boolean).at(-1) ?? 'Directory';
  }
  return 'Loading document';
}

function resolveExternalSurfaceDescription(
  selection: ExternalLibrarySelection,
  selectedFolder: RuntimeExternalSearchFolder | null,
  error: string | null
) {
  if (error) {
    return error;
  }
  if (selection.kind === 'root') {
    return 'Select a configured external folder to browse its directories and documents.';
  }
  if (selection.kind === 'folder') {
    return selectedFolder
      ? `Browse Markdown and text files from ${resolveExternalFolderLabel(selectedFolder.folderPath)}.`
      : 'Select a folder to browse.';
  }
  if (selection.kind === 'directory') {
    return 'Choose a document from the directory list to open its read-only preview.';
  }
  return 'Loading the selected external document.';
}
