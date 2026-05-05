import { useEffect, useMemo, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

import type { NativeTextImportResult } from '../../../lib/platform/nativeImportContract';
import type { Node } from '../../features/nodes/model/nodeTypes';
import {
  importRuntimeExternalSearchDocument,
  type RuntimeExternalSearchBrowseEntry,
  loadRuntimeExternalSearchPreview,
  type RuntimeExternalSearchFolder,
  type RuntimeExternalSearchPreview
} from '../../shared/platform/externalSearchBridge';
import { AppEmptyState } from '../../shared/ui';
import { useWorkspaceStore } from '../../store/workspaceStore';

import {
  buildExternalLibraryFolderBrowseState,
  type ExternalLibrarySelection
} from './externalLibraryBrowseModel';
import {
  resolveExternalSurfaceDescription,
  resolveExternalSurfaceTitle
} from './externalLibraryDocumentSurfaceSupport';
import { FolderListView } from './FolderListView';
import { ExternalLibraryPreviewSurface } from './ExternalLibraryPreviewSurface';

interface ExternalLibraryDocumentSurfaceProps {
  documentMaxWidth: number;
  entriesByFolderId: Record<string, RuntimeExternalSearchBrowseEntry[] | undefined>;
  folders: RuntimeExternalSearchFolder[];
  onOpenImportedNode: (result: NativeTextImportResult) => void;
  onOpenSelection: (selection: ExternalLibrarySelection) => void;
  onResetLayout: () => void;
  onStartDocumentResize: (
    side: 'left' | 'right',
    event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>
  ) => void;
  selection: ExternalLibrarySelection;
}

function toExternalDocumentNode(entry: Pick<RuntimeExternalSearchBrowseEntry, 'absolutePath' | 'folderId' | 'modifiedAt' | 'openingText' | 'title'>): Node {
  return {
    content: '',
    createdAt: entry.modifiedAt,
    id: entry.absolutePath,
    kind: 'topic',
    openingText: entry.openingText,
    parentNodeId: entry.folderId,
    reading: null,
    reveal: null,
    review: null,
    title: entry.title,
    updatedAt: entry.modifiedAt
  };
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

function useExternalFolderBrowseState(props: Pick<ExternalLibraryDocumentSurfaceProps, 'entriesByFolderId' | 'folders' | 'selection'>) {
  const activeFolderId = props.selection.kind === 'root' ? null : props.selection.folderId;
  const selectedFolder = activeFolderId
    ? props.folders.find((folder) => folder.id === activeFolderId) ?? null
    : null;
  const folderEntries = selectedFolder ? props.entriesByFolderId[selectedFolder.id] ?? [] : [];
  const browseState = useMemo(
    () =>
      !selectedFolder || props.selection.kind === 'root'
        ? null
        : buildExternalLibraryFolderBrowseState(selectedFolder, folderEntries, props.selection),
    [folderEntries, props.selection, selectedFolder]
  );
  const documentNodes = useMemo(
    () => (browseState?.documentItems ?? []).map((item) => toExternalDocumentNode(item)),
    [browseState?.documentItems]
  );
  const documentNodesById = useMemo(
    () => Object.fromEntries(documentNodes.map((node) => [node.id, node])),
    [documentNodes]
  );

  return { activeFolderId, documentNodes, documentNodesById, selectedFolder };
}

function ExternalFolderListSurface(args: {
  activeFolderId: string;
  documentMaxWidth: number;
  documentNodes: Node[];
  documentNodesById: Record<string, Node>;
  onOpenSelection: ExternalLibraryDocumentSurfaceProps['onOpenSelection'];
  onResetLayout: ExternalLibraryDocumentSurfaceProps['onResetLayout'];
  onStartDocumentResize: ExternalLibraryDocumentSurfaceProps['onStartDocumentResize'];
  selectedFolder: RuntimeExternalSearchFolder | null;
  selection: Extract<ExternalLibrarySelection, { kind: 'folder' | 'directory' }>;
}) {
  return (
    <section aria-label="Document area" className="flex min-h-0 flex-1 flex-col bg-canvas">
      <FolderListView
        documentMaxWidth={args.documentMaxWidth}
        emptyState={{
          description:
            args.selection.kind === 'folder'
              ? 'No documents are available in the selected external folder.'
              : 'No documents are available in the selected directory.',
          title: 'No documents'
        }}
        folderTitle={resolveExternalSurfaceTitle(args.selection, args.selectedFolder)}
        nodes={args.documentNodes}
        nodesById={args.documentNodesById}
        onSelectNode={(absolutePath) =>
          args.onOpenSelection({
            absolutePath,
            folderId: args.activeFolderId,
            kind: 'document'
          })
        }
        onResetLayout={args.onResetLayout}
        onStartDocumentResize={args.onStartDocumentResize}
        regionLabel="Folder list view"
      />
    </section>
  );
}

function ExternalEmptySurface(args: {
  error: string | null;
  selectedFolder: RuntimeExternalSearchFolder | null;
  selection: Exclude<ExternalLibrarySelection, { kind: 'document' }>;
}) {
  return (
    <section aria-label="Document area" className="flex min-h-0 flex-1 items-center justify-center bg-canvas px-6">
      <AppEmptyState
        description={resolveExternalSurfaceDescription(args.selection, args.selectedFolder, args.error)}
        title={resolveExternalSurfaceTitle(args.selection, args.selectedFolder)}
      />
    </section>
  );
}

export function ExternalLibraryDocumentSurface(props: ExternalLibraryDocumentSurfaceProps) {
  const { error, preview } = useExternalSearchPreview(props.selection);
  const [isImporting, setIsImporting] = useState(false);
  const { activeFolderId, documentNodes, documentNodesById, selectedFolder } = useExternalFolderBrowseState(props);

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

  if ((props.selection.kind === 'folder' || props.selection.kind === 'directory') && activeFolderId) {
    return (
      <ExternalFolderListSurface
        activeFolderId={activeFolderId}
        documentMaxWidth={props.documentMaxWidth}
        documentNodes={documentNodes}
        documentNodesById={documentNodesById}
        onOpenSelection={props.onOpenSelection}
        onResetLayout={props.onResetLayout}
        onStartDocumentResize={props.onStartDocumentResize}
        selectedFolder={selectedFolder}
        selection={props.selection}
      />
    );
  }

  if (props.selection.kind !== 'document') {
    return <ExternalEmptySurface error={error} selectedFolder={selectedFolder} selection={props.selection} />;
  }

  if (!preview) {
    return (
      <section aria-label="Document area" className="flex min-h-0 flex-1 items-center justify-center bg-canvas px-6">
        <AppEmptyState
          description={resolveExternalSurfaceDescription(props.selection, selectedFolder, error)}
          title={resolveExternalSurfaceTitle(props.selection, selectedFolder)}
        />
      </section>
    );
  }

  return <ExternalLibraryPreviewSurface isImporting={isImporting} onHandleImport={() => void handleImport()} preview={preview} />;
}
