import { useEffect, useMemo } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { ExternalDocumentImportResult } from '../../shared/platform/externalDocumentImportRepository';
import type { ExternalDocumentPreview } from '../../shared/platform/externalDocumentPreviewRepository';
import type {
  ExternalLibraryBrowseEntry,
  ExternalLibraryFolder
} from '../../shared/platform/externalLibraryBrowseRepository';
import { AppButton, AppEmptyState, AppErrorState, AppLoadingState } from '../../shared/ui';

import { useOpenImportedExternalDocument } from './externalDocumentImportState';
import { markExternalDocumentOpened } from './externalDocumentLastOpenedAt';
import {
  buildExternalLibraryFolderBrowseState,
  type ExternalLibrarySelection
} from './externalLibraryBrowseModel';
import {
  resolveExternalSurfaceDescription,
  resolveExternalSurfaceTitle
} from './externalLibraryDocumentSurfaceSupport';
import { ExternalLibraryPreviewSurface } from './ExternalLibraryPreviewSurface';
import type { ExternalDocumentPreviewLoadState } from './externalSearchPreviewState';
import { FolderListView } from './FolderListView';

interface ExternalLibraryDocumentSurfaceProps {
  canGoBack: boolean;
  canGoForward: boolean;
  documentMaxWidth: number;
  entriesByFolderId: Record<string, ExternalLibraryBrowseEntry[] | undefined>;
  folders: ExternalLibraryFolder[];
  onPreviewEditorReady: (adapter: EditorAdapter | null) => void;
  onOpenImportedNode: (result: ExternalDocumentImportResult) => void;
  onOpenSelection: (selection: ExternalLibrarySelection) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  previewState: ExternalDocumentPreviewLoadState;
  selection: ExternalLibrarySelection;
}

function toExternalDocumentNode(entry: Pick<ExternalLibraryBrowseEntry, 'absolutePath' | 'folderId' | 'modifiedAt' | 'openingText' | 'title'>): Node {
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
  documentNodes: Node[];
  documentNodesById: Record<string, Node>;
  onOpenSelection: ExternalLibraryDocumentSurfaceProps['onOpenSelection'];
  selectedFolder: ExternalLibraryFolder | null;
  selection: Extract<ExternalLibrarySelection, { kind: 'folder' | 'directory' }>;
}) {
  return (
    <section aria-label="Document area" className="workspace-region-main-document flex min-h-0 flex-1 flex-col">
      <FolderListView
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
        regionLabel="Folder list view"
      />
    </section>
  );
}

function ExternalEmptySurface(args: {
  selectedFolder: ExternalLibraryFolder | null;
  selection: Exclude<ExternalLibrarySelection, { kind: 'document' }>;
}) {
  return (
    <section aria-label="Document area" className="workspace-region-main-document flex min-h-0 flex-1 items-center justify-center px-6">
      <AppEmptyState
        description={resolveExternalSurfaceDescription(args.selection, args.selectedFolder, null)}
        title={resolveExternalSurfaceTitle(args.selection, args.selectedFolder)}
      />
    </section>
  );
}

function ExternalDocumentLoadingSurface() {
  return (
    <section aria-label="Document area" className="workspace-region-main-document flex min-h-0 flex-1 items-center justify-center px-6">
      <AppLoadingState description="Loading the selected external document." title="Loading document" />
    </section>
  );
}

function ExternalDocumentErrorSurface(args: { error: string; onRetry: () => void }) {
  return (
    <section aria-label="Document area" className="workspace-region-main-document flex min-h-0 flex-1 items-center justify-center px-6">
      <AppErrorState
        action={
          <AppButton onClick={args.onRetry} size="sm">
            Retry
          </AppButton>
        }
        description={args.error}
        title="External preview unavailable"
      />
    </section>
  );
}

function renderExternalPreviewSurface(args: {
  isImporting: boolean;
  onHandleImport: () => void;
  onPreviewEditorReady: (adapter: EditorAdapter | null) => void;
  preview: ExternalDocumentPreview;
  props: ExternalLibraryDocumentSurfaceProps;
}) {
  return (
    <ExternalLibraryPreviewSurface
      canGoBack={args.props.canGoBack}
      canGoForward={args.props.canGoForward}
      documentMaxWidth={args.props.documentMaxWidth}
      isImporting={args.isImporting}
      onGoBack={args.props.onGoBack}
      onGoForward={args.props.onGoForward}
      onHandleImport={args.onHandleImport}
      onOpenSelection={args.props.onOpenSelection}
      onPreviewEditorReady={args.onPreviewEditorReady}
      preview={args.preview}
    />
  );
}

export function ExternalLibraryDocumentSurface(props: ExternalLibraryDocumentSurfaceProps) {
  const { error, isLoading, preview, retry } = props.previewState;
  const { handleImport, isImporting } = useOpenImportedExternalDocument(preview, props.onOpenImportedNode);
  const { activeFolderId, documentNodes, documentNodesById, selectedFolder } = useExternalFolderBrowseState(props);

  useEffect(() => {
    if (props.selection.kind === 'document') {
      markExternalDocumentOpened(props.selection.absolutePath);
    }
  }, [props.selection]);

  if ((props.selection.kind === 'folder' || props.selection.kind === 'directory') && activeFolderId) {
    return (
      <ExternalFolderListSurface
        activeFolderId={activeFolderId}
        documentNodes={documentNodes}
        documentNodesById={documentNodesById}
        onOpenSelection={props.onOpenSelection}
        selectedFolder={selectedFolder}
        selection={props.selection}
      />
    );
  }

  if (props.selection.kind !== 'document') {
    return <ExternalEmptySurface selectedFolder={selectedFolder} selection={props.selection} />;
  }

  if (isLoading) {
    return <ExternalDocumentLoadingSurface />;
  }

  if (error) {
    return <ExternalDocumentErrorSurface error={error} onRetry={retry} />;
  }

  if (!preview) {
    return <ExternalDocumentLoadingSurface />;
  }

  return renderExternalPreviewSurface({
    isImporting,
    onHandleImport: () => void handleImport(),
    onPreviewEditorReady: props.onPreviewEditorReady,
    preview,
    props
  });
}
