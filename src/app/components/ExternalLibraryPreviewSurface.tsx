import type { CSSProperties } from 'react';
import { useRef } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../features/settings/model/reviewSchedulerSettings';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type { ExternalDocumentPreview } from '../../shared/platform/externalDocumentPreviewRepository';
import { ScalablePanel } from '../../shared/ui';

import { DocumentPanelHeader } from './DocumentPanelHeader';
import {
  normalizeExternalDirectoryPath,
  resolveExternalFolderDisplayLabel,
  type ExternalLibrarySelection
} from './externalLibraryBrowseModel';
import { ExternalPreviewContent } from './ExternalPreviewContent';
import { ExternalPreviewHeaderActions } from './ExternalPreviewHeaderActions';
import { useExternalLinkPanels } from './useExternalLinkPanels';
import type { OpenedLocalFileSaveStatus } from './useOpenedLocalFileEditing';

export function ExternalLibraryPreviewSurface(args: {
  canGoBack: boolean;
  canGoForward: boolean;
  documentMaxWidth: number;
  editorAppearanceKey: string;
  isImporting: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onHandleImport: () => void;
  onOpenImportedNodeId: (nodeId: string) => void;
  onOpenSelection: (selection: ExternalLibrarySelection) => void;
  onPreviewEditorReady: (adapter: EditorAdapter | null) => void;
  localFileEditing: {
    content: string;
    flushSave: (force?: boolean) => Promise<boolean>;
    handleChange: (content: string) => void;
    isEditable: boolean;
    reloadFromDisk: () => Promise<void>;
    status: OpenedLocalFileSaveStatus;
  };
  preview: ExternalDocumentPreview;
}) {
  const t = useTranslation();
  const contentAreaRef = useRef<HTMLDivElement | null>(null);
  const { handleCloseExternalLink, handleLinkPanelStateChange, handleOpenExternalLink, linkPanels } = useExternalLinkPanels();

  return (
    <ScalablePanel className="flex flex-1" label="Document panel" panelId="document-panel">
      <section aria-label={t('desktop.externalLibrary.documentArea')} className="workspace-region-main-document flex min-h-0 flex-1 flex-col" style={toDocumentWidthStyle(args.documentMaxWidth)}>
      <ExternalPreviewHeader
        canGoBack={args.canGoBack}
        canGoForward={args.canGoForward}
        onGoBack={args.onGoBack}
        onGoForward={args.onGoForward}
        onHandleImport={args.onHandleImport}
        onOpenImportedNodeId={args.onOpenImportedNodeId}
        onOpenSelection={args.onOpenSelection}
        preview={args.preview}
        localFileEditing={args.localFileEditing}
        isImporting={args.isImporting}
      />
      <div
        className="relative flex min-h-0 flex-1 flex-col pl-4 pr-0 pt-2 pb-0 max-[1080px]:pl-2 max-[1080px]:pr-0 max-[1080px]:pt-2 max-[1080px]:pb-0"
        ref={contentAreaRef}
      >
        <ExternalPreviewContent
          contentAreaRef={contentAreaRef}
          editorAppearanceKey={args.editorAppearanceKey}
          linkPanels={linkPanels}
          localFileEditing={args.localFileEditing}
          onCloseExternalLink={handleCloseExternalLink}
          onLinkPanelStateChange={handleLinkPanelStateChange}
          onOpenExternalLink={handleOpenExternalLink}
          onPreviewEditorReady={args.onPreviewEditorReady}
          preview={args.preview}
        />
      </div>
      </section>
    </ScalablePanel>
  );
}

function toDocumentWidthStyle(documentMaxWidth: number) {
  return { '--document-max-width': `${documentMaxWidth}px` } as CSSProperties;
}

function ExternalPreviewHeader(args: {
  canGoBack: boolean;
  canGoForward: boolean;
  isImporting: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onHandleImport: () => void;
  onOpenImportedNodeId: (nodeId: string) => void;
  onOpenSelection: (selection: ExternalLibrarySelection) => void;
  localFileEditing: {
    flushSave: (force?: boolean) => Promise<boolean>;
    isEditable: boolean;
    reloadFromDisk: () => Promise<void>;
    status: OpenedLocalFileSaveStatus;
  };
  preview: ExternalDocumentPreview;
}) {
  const breadcrumbModel = buildExternalBreadcrumbModel(args.preview);
  return (
    <div>
      <DocumentPanelHeader
        activeNodeId={breadcrumbModel.activeNodeId}
        backlinks={[]}
        canGoBack={args.canGoBack}
        canGoForward={args.canGoForward}
        canGoParent={false}
        editableNodeId={null}
        folderListToolbar={null}
        isFolderListView={false}
        isSourceUpdatePanelOpen={false}
        nodesById={breadcrumbModel.nodesById}
        onGoBack={args.onGoBack}
        onGoForward={args.onGoForward}
        onGoParent={() => undefined}
        onNodePriorityChange={() => undefined}
        onSelectBacklinkNode={() => undefined}
        onSelectBreadcrumbNode={(nodeId) => {
          const selection = breadcrumbModel.selectionsByNodeId[nodeId];
          if (selection) args.onOpenSelection(selection);
        }}
        onToggleSourceUpdatePanel={() => undefined}
        priorityQuickSetShortcutLabel=""
        reviewSchedulerSettings={DEFAULT_REVIEW_SCHEDULER_SETTINGS}
        rightSlot={(
          <ExternalPreviewHeaderActions
            importedNodeId={args.preview.importedNodeId ?? null}
            isImporting={args.isImporting}
            localFileEditing={args.localFileEditing}
            onHandleImport={args.onHandleImport}
            onOpenImportedNodeId={args.onOpenImportedNodeId}
          />
        )}
        showDocumentControls={false}
        showSourceUpdateAction={false}
      />
    </div>
  );
}

function createExternalHeaderNode(id: string, parentNodeId: string | null, title: string, kind: Node['kind']): Node {
  return {
    content: '',
    createdAt: '',
    id,
    kind,
    parentNodeId,
    reading: null,
    reveal: null,
    review: null,
    title,
    updatedAt: ''
  };
}

function buildExternalBreadcrumbModel(preview: ExternalDocumentPreview) {
  const nodesById: Record<string, Node> = {};
  const selectionsByNodeId: Record<string, ExternalLibrarySelection> = {};
  const rootId = `external:${preview.folderId}`;
  let parentNodeId: string | null = rootId;
  const folderTitle = resolveExternalFolderDisplayLabel({
    folderPath: preview.folderPath,
    id: preview.folderId
  });
  nodesById[rootId] = createExternalHeaderNode(rootId, null, folderTitle, 'folder');
  selectionsByNodeId[rootId] = { folderId: preview.folderId, kind: 'folder' };

  resolveExternalDirectorySegments(preview.relativePath).forEach((segment, index, segments) => {
    const directoryPath = segments.slice(0, index + 1).join('/');
    const nodeId = `${rootId}:${directoryPath}`;
    nodesById[nodeId] = createExternalHeaderNode(nodeId, parentNodeId, segment, 'folder');
    selectionsByNodeId[nodeId] = { directoryPath, folderId: preview.folderId, kind: 'directory' };
    parentNodeId = nodeId;
  });

  const activeNodeId = `${rootId}:${preview.absolutePath}`;
  nodesById[activeNodeId] = createExternalHeaderNode(activeNodeId, parentNodeId, preview.fileName, 'topic');
  return { activeNodeId, nodesById, selectionsByNodeId };
}

function resolveExternalDirectorySegments(relativePath: string) {
  const segments = normalizeExternalDirectoryPath(relativePath).split('/').filter(Boolean);
  segments.pop();
  return segments;
}
