import { Maximize2, Minimize2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

import { MarkdownEditor } from '../../features/editor/components/MarkdownEditor';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type { ExternalDocumentPreview } from '../../shared/platform/externalDocumentPreviewRepository';
import { AppButton, AppErrorState, AppIconButton, AppLoadingState, appFloatingSurfaceClassName } from '../../shared/ui';
import { ensureWorkspaceNodeDocumentReady } from '../../store/workspaceNodePreparation';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { useExternalDocumentPreviewPanelFrame } from './externalDocumentPreviewPanelState';
import { useExternalSearchPreviewDocument } from './externalSearchPreviewState';
import type { WorkspaceSearchResult } from './workspaceSearch';

interface SearchResultPreviewPanelProps {
  nodesById: Record<string, Node>;
  onClose: () => void;
  onOpenResult: (result: WorkspaceSearchResult) => void;
  result: WorkspaceSearchResult | null;
}

function useNodePreviewContent(result: WorkspaceSearchResult | null, nodesById: Record<string, Node>) {
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!result || (result.kind !== 'node' && result.kind !== 'pdf')) {
      setContent('');
      setIsLoading(false);
      return;
    }
    const node = nodesById[result.id] ?? useWorkspaceStore.getState().nodesById[result.id];
    if (result.kind === 'pdf') {
      setContent(result.excerpt);
      return;
    }
    if (node?.content) {
      setContent(node.content);
      return;
    }
    setContent(result.excerpt);
    let cancelled = false;
    setIsLoading(false);
    void ensureWorkspaceNodeDocumentReady(result.id, { keepWarm: true }).then((document) => {
      if (!cancelled) {
        setContent(document?.content || result.excerpt);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [nodesById, result]);

  return { content, isLoading };
}

function resolvePreviewContent(args: {
  externalPreview: ExternalDocumentPreview | null;
  nodeContent: string;
  result: WorkspaceSearchResult;
}) {
  if (args.result.kind === 'external') return args.externalPreview?.content ?? '';
  if (args.result.kind === 'removed') return args.result.removedMatch?.entry.content ?? args.result.excerpt;
  return args.nodeContent || args.result.excerpt;
}

export function SearchResultPreviewPanel(props: SearchResultPreviewPanelProps) {
  const { editorAppearanceKey } = useAppearanceSettings();
  const overlayRef = useRef<HTMLDivElement>(null);
  const frame = useExternalDocumentPreviewPanelFrame(overlayRef, Boolean(props.result));
  const externalPath = props.result?.kind === 'external' ? props.result.externalMatch?.absolutePath ?? null : null;
  const external = useExternalSearchPreviewDocument(externalPath);
  const nodePreview = useNodePreviewContent(props.result, props.nodesById);

  if (!props.result) return null;
  const result = props.result;

  const isLoading = result.kind === 'external' ? external.isLoading : nodePreview.isLoading;
  const error = result.kind === 'external' ? external.error : null;
  const content = resolvePreviewContent({
    externalPreview: external.preview,
    nodeContent: nodePreview.content,
    result
  });

  return (
    <SearchResultPreviewWindow
      content={content}
      editorAppearanceKey={editorAppearanceKey}
      error={error}
      frame={frame}
      isLoading={isLoading}
      onClose={props.onClose}
      onOpenResult={props.onOpenResult}
      overlayRef={overlayRef}
      result={result}
    />
  );
}

function SearchResultPreviewWindow(props: {
  content: string;
  editorAppearanceKey: string;
  error: string | null;
  frame: ReturnType<typeof useExternalDocumentPreviewPanelFrame>;
  isLoading: boolean;
  onClose: () => void;
  onOpenResult: (result: WorkspaceSearchResult) => void;
  overlayRef: RefObject<HTMLDivElement>;
  result: WorkspaceSearchResult;
}) {
  const t = useTranslation();
  return (
    <div aria-label={t('desktop.searchPreview.dialog')} className="pointer-events-none fixed inset-0 z-workspace-overlay bg-[var(--app-floating-overlay-bg)]" ref={props.overlayRef} role="dialog">
      <section className={appFloatingSurfaceClassName('panel', 'pointer-events-auto absolute flex flex-col overflow-hidden')} style={props.frame.panelStyle}>
        <SearchResultPreviewHeader
          frame={props.frame}
          onClose={props.onClose}
          onOpen={() => props.onOpenResult(props.result)}
          title={props.result.title}
        />
        <SearchResultPreviewBody {...props} />
        <SearchResultPreviewResizeHandle frame={props.frame} />
      </section>
    </div>
  );
}

function SearchResultPreviewHeader(props: {
  frame: ReturnType<typeof useExternalDocumentPreviewPanelFrame>;
  onClose: () => void;
  onOpen: () => void;
  title: string;
}) {
  const t = useTranslation();
  return (
    <header
      className="flex cursor-move items-start justify-between gap-3 border-b border-[var(--app-floating-divider-color)] px-4 py-3"
      onPointerDown={(event) => {
        if ((event.target as HTMLElement | null)?.closest('button')) return;
        props.frame.startDrag(event);
      }}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-foreground">{props.title}</div>
        <div className="mt-1 text-xs text-foreground/55">{t('desktop.searchPreview.subtitle')}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <AppButton onClick={props.onOpen} size="sm">{t('desktop.searchPreview.open')}</AppButton>
        <AppIconButton
          icon={props.frame.isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          label={props.frame.isFullscreen ? t('desktop.searchPreview.restoreWindow') : t('desktop.searchPreview.fullScreen')}
          onClick={props.frame.onToggleFullscreen}
        />
        <AppIconButton icon={<X className="size-4" />} label={t('desktop.searchPreview.close')} onClick={props.onClose} />
      </div>
    </header>
  );
}

function SearchResultPreviewResizeHandle(props: {
  frame: ReturnType<typeof useExternalDocumentPreviewPanelFrame>;
}) {
  if (props.frame.isFullscreen) return null;
  return (
    <div
      aria-hidden="true"
      className="absolute bottom-0 right-0 size-5 cursor-nwse-resize"
      onPointerDown={props.frame.onResizeStart}
    />
  );
}

function SearchResultPreviewBody(props: {
  content: string;
  editorAppearanceKey: string;
  error: string | null;
  isLoading: boolean;
  result: WorkspaceSearchResult;
}) {
  const t = useTranslation();
  return (
    <div className="min-h-0 flex-1 bg-canvas">
      {props.isLoading ? (
        <div className="flex h-full items-center justify-center px-6"><AppLoadingState /></div>
      ) : props.error ? (
        <div className="flex h-full items-center justify-center px-6">
          <AppErrorState title={t('desktop.searchPreview.unavailable')} description={props.error} />
        </div>
      ) : (
        <MarkdownEditor
          className="h-full"
          key={`search-preview-${props.editorAppearanceKey}-${props.result.kind}-${props.result.id}`}
          nodeId={null}
          onChange={() => undefined}
          readOnly
          value={props.content}
        />
      )}
    </div>
  );
}
