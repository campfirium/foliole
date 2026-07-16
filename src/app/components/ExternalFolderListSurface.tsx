import type { Node } from '../../features/nodes/model/nodeTypes';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type {
  ExternalLibraryBrowseEntry,
  ExternalLibraryFolder
} from '../../shared/platform/externalLibraryBrowseRepository';
import { ScalablePanel } from '../../shared/ui';

import {
  buildExternalLibraryFolderBrowseState,
  type ExternalLibrarySelection
} from './externalLibraryBrowseModel';
import { resolveExternalSurfaceTitle } from './externalLibraryDocumentSurfaceSupport';
import { FolderListView } from './FolderListView';

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

export function buildExternalFolderBrowseProjection(args: {
  entriesByFolderId: Record<string, ExternalLibraryBrowseEntry[] | undefined>;
  folders: ExternalLibraryFolder[];
  selection: ExternalLibrarySelection;
}) {
  const activeFolderId = args.selection.kind === 'root' ? null : args.selection.folderId;
  const selectedFolder = activeFolderId
    ? args.folders.find((folder) => folder.id === activeFolderId) ?? null
    : null;
  const folderEntries = selectedFolder ? args.entriesByFolderId[selectedFolder.id] ?? [] : [];
  const browseState =
    !selectedFolder || args.selection.kind === 'root'
      ? null
      : buildExternalLibraryFolderBrowseState(selectedFolder, folderEntries, args.selection);
  const documentNodes = (browseState?.documentItems ?? []).map((item) => toExternalDocumentNode(item));
  return {
    activeFolderId,
    documentNodes,
    documentNodesById: Object.fromEntries(documentNodes.map((node) => [node.id, node])),
    documentSourceKindByPath: Object.fromEntries((browseState?.documentItems ?? []).map((item) => [item.absolutePath, item.sourceKind])),
    selectedFolder
  };
}

export function ExternalFolderListSurface(args: {
  activeFolderId: string;
  canGoBack: boolean;
  canGoForward: boolean;
  documentNodes: Node[];
  documentNodesById: Record<string, Node>;
  documentSourceKindByPath: Record<string, 'external_document' | 'local_file' | undefined>;
  onGoBack: () => void;
  onGoForward: () => void;
  onOpenSelection: (selection: ExternalLibrarySelection) => void;
  selectedFolder: ExternalLibraryFolder | null;
  selection: Extract<ExternalLibrarySelection, { kind: 'folder' | 'directory' }>;
}) {
  const t = useTranslation();
  function handleSelectDocument(absolutePath: string) {
    const sourceKind = args.documentSourceKindByPath[absolutePath];
    args.onOpenSelection({
      absolutePath,
      folderId: args.activeFolderId,
      kind: 'document',
      ...(sourceKind ? { sourceKind } : {})
    });
  }

  return (
    <ScalablePanel className="flex flex-1" label="List panel" panelId="list-panel">
      <section aria-label={t('desktop.externalLibrary.documentArea')} className="workspace-region-main-document flex min-h-0 flex-1 flex-col">
        <FolderListView
          emptyState={{
            description:
              args.selection.kind === 'folder'
                ? t('desktop.externalLibrary.folderEmpty.description')
                : t('desktop.externalLibrary.directoryEmpty.description'),
            title: t('desktop.externalLibrary.empty.title')
          }}
          folderTitle={resolveExternalSurfaceTitle(args.selection, args.selectedFolder, t)}
          navigationOverlay={{
            canGoBack: args.canGoBack,
            canGoForward: args.canGoForward,
            onGoBack: args.onGoBack,
            onGoForward: args.onGoForward
          }}
          nodes={args.documentNodes}
          nodesById={args.documentNodesById}
          onSelectNode={handleSelectDocument}
          regionLabel={t('desktop.externalLibrary.folderListView')}
        />
      </section>
    </ScalablePanel>
  );
}
