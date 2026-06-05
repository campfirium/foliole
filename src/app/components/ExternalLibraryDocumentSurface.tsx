import { useEffect, useMemo } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type { ExternalDocumentImportResult } from '../../shared/platform/externalDocumentImportRepository';
import type { ExternalDocumentPreview } from '../../shared/platform/externalDocumentPreviewRepository';
import type {
  ExternalLibraryBrowseEntry,
  ExternalLibraryFolder
} from '../../shared/platform/externalLibraryBrowseRepository';
import { AppButton, AppEmptyState, AppErrorState, AppLoadingState } from '../../shared/ui';

import { useOpenImportedExternalDocument } from './externalDocumentImportState';
import { markExternalDocumentOpened } from './externalDocumentLastOpenedAt';
import { buildExternalFolderBrowseProjection, ExternalFolderListSurface } from './ExternalFolderListSurface';
import type { ExternalLibrarySelection } from './externalLibraryBrowseModel';
import {
  resolveExternalSurfaceDescription,
  resolveExternalSurfaceTitle
} from './externalLibraryDocumentSurfaceSupport';
import { ExternalLibraryPreviewSurface } from './ExternalLibraryPreviewSurface';
import type { ExternalDocumentPreviewLoadState } from './externalSearchPreviewState';

interface ExternalLibraryDocumentSurfaceProps {
  canGoBack: boolean;
  canGoForward: boolean;
  documentMaxWidth: number;
  editorAppearanceKey: string;
  entriesByFolderId: Record<string, ExternalLibraryBrowseEntry[] | undefined>;
  folders: ExternalLibraryFolder[];
  onPreviewEditorReady: (adapter: EditorAdapter | null) => void;
  onOpenImportedNode: (result: ExternalDocumentImportResult) => void;
  onOpenImportedNodeId?: (nodeId: string) => void;
  onOpenSelection: (selection: ExternalLibrarySelection) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  previewState: ExternalDocumentPreviewLoadState;
  selection: ExternalLibrarySelection;
}

function useExternalFolderBrowseState(props: Pick<ExternalLibraryDocumentSurfaceProps, 'entriesByFolderId' | 'folders' | 'selection'>) {
  return useMemo(() => buildExternalFolderBrowseProjection(props), [
    props.entriesByFolderId,
    props.folders,
    props.selection
  ]);
}

function ExternalEmptySurface(args: {
  selectedFolder: ExternalLibraryFolder | null;
  selection: Exclude<ExternalLibrarySelection, { kind: 'document' }>;
}) {
  const t = useTranslation();
  return (
    <section aria-label={t('desktop.externalLibrary.documentArea')} className="workspace-region-main-document flex min-h-0 flex-1 items-center justify-center px-6">
      <AppEmptyState
        description={resolveExternalSurfaceDescription(args.selection, args.selectedFolder, null, t)}
        title={resolveExternalSurfaceTitle(args.selection, args.selectedFolder, t)}
      />
    </section>
  );
}

function ExternalDocumentLoadingSurface() {
  const t = useTranslation();
  return (
    <section aria-label={t('desktop.externalLibrary.documentArea')} className="workspace-region-main-document flex min-h-0 flex-1 items-center justify-center px-6">
      <AppLoadingState />
    </section>
  );
}

function ExternalDocumentErrorSurface(args: { error: string; onRetry: () => void }) {
  const t = useTranslation();
  return (
    <section aria-label={t('desktop.externalLibrary.documentArea')} className="workspace-region-main-document flex min-h-0 flex-1 items-center justify-center px-6">
      <AppErrorState
        action={
          <AppButton onClick={args.onRetry} size="sm">
            {t('desktop.externalLibrary.retry')}
          </AppButton>
        }
        description={args.error}
        title={t('desktop.externalLibrary.previewUnavailable')}
      />
    </section>
  );
}

function renderExternalPreviewSurface(args: {
  isImporting: boolean;
  onHandleImport: () => void;
  onOpenImportedNodeId: (nodeId: string) => void;
  onPreviewEditorReady: (adapter: EditorAdapter | null) => void;
  preview: ExternalDocumentPreview;
  props: ExternalLibraryDocumentSurfaceProps;
}) {
  return (
    <ExternalLibraryPreviewSurface
      canGoBack={args.props.canGoBack}
      canGoForward={args.props.canGoForward}
      documentMaxWidth={args.props.documentMaxWidth}
      editorAppearanceKey={args.props.editorAppearanceKey}
      isImporting={args.isImporting}
      onGoBack={args.props.onGoBack}
      onGoForward={args.props.onGoForward}
      onHandleImport={args.onHandleImport}
      onOpenImportedNodeId={args.onOpenImportedNodeId}
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
        canGoBack={props.canGoBack}
        canGoForward={props.canGoForward}
        documentNodes={documentNodes}
        documentNodesById={documentNodesById}
        onGoBack={props.onGoBack}
        onGoForward={props.onGoForward}
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
    onOpenImportedNodeId: props.onOpenImportedNodeId ?? (() => undefined),
    onPreviewEditorReady: props.onPreviewEditorReady,
    preview,
    props
  });
}
