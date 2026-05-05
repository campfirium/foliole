import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorDiffDecorations } from '../../features/editor/adapters/EditorAdapter';
import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import { MarkdownEditor } from '../../features/editor/components/MarkdownEditor';
import { getImageClozeAnswerEditorNodeId } from '../../features/image-cloze/model/imageClozePresentation';
import { cn } from '../../shared/lib/utils';
import { AppEmptyState } from '../../shared/ui';
import type { NodeViewState } from '../../store/workspaceStore';
import type { ResizeSide } from '../hooks/useDocumentWidthResizer';

import { DocumentOutlineLayer } from './DocumentOutlineLayer';

interface DocumentPanelBodyProps {
  answerEditorDebugId?: string;
  answerSectionMode?: 'balanced' | 'fixed';
  documentMaxWidth: number;
  editorAppearanceKey: string;
  editorContent: string;
  editorContentPaddingBottom?: string;
  fitBlockImagesToViewport?: boolean;
  editorDiffDecorations?: EditorDiffDecorations | null;
  editorHideScrollbar?: boolean;
  editorHideTitleHeading?: boolean;
  emptyContent?: ReactNode;
  editorNodeId: string | null;
  editorNodeViewState?: NodeViewState;
  emptyState?: {
    description: string;
    title: string;
  };
  hasAnswerSection: boolean;
  isDocumentResizing: boolean;
  onAnswerChange: (answer: string) => void;
  onAnswerImageMetricsChange?: (metrics: BlockImageMetrics | null) => void;
  onAnswerImageLoadStateChange?: (state: { loadedCount: number; totalCount: number }) => void;
  onEditorChange: (content: string) => void;
  onEditorContextMenu?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onEditorReady?: (adapter: EditorAdapter | null) => void;
  onPromptImageMetricsChange?: (metrics: BlockImageMetrics | null) => void;
  onPromptImageLoadStateChange?: (state: { loadedCount: number; totalCount: number }) => void;
  onRevealDocumentPosition: (position: number) => void;
  onRevealDocumentSelection: (selection: EditorSelection) => void;
  onResolveDocumentPositionAtViewportY: (clientY: number) => number | null;
  onResetLayout: () => void;
  onStartDocumentResize: (
    side: ResizeSide,
    event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>
  ) => void;
  promptEditorDebugId?: string;
  readOnly?: boolean;
  reveal: string;
  sharedBlockImageMaxHeight?: number;
  showDocumentOutline?: boolean;
  showDocumentResizeHandles?: boolean;
}

interface BlockImageMetrics {
  imageCount: number;
  nonImageHeight: number;
}

interface DocumentWidthHandleProps {
  ariaLabel: string;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>) => void;
  onResetLayout: () => void;
  side: ResizeSide;
}

interface AnswerSectionProps {
  answerSectionMode: 'balanced' | 'fixed';
  blockImageMaxHeightOverride?: number;
  editorAppearanceKey: string;
  editorNodeId: string | null;
  fitBlockImagesToViewport?: boolean;
  onAnswerImageLoadStateChange?: (state: { loadedCount: number; totalCount: number }) => void;
  onFitBlockImageMetricsChange?: (metrics: BlockImageMetrics | null) => void;
  onAnswerChange: (answer: string) => void;
  reveal: string;
}

function DocumentWidthHandle({ ariaLabel, onPointerDown, onResetLayout, side }: DocumentWidthHandleProps) {
  const style =
    side === 'left'
      ? { left: 'max(0px, calc((100% - min(100%, var(--document-max-width))) / 2 - 5px))' }
      : { right: 'max(0px, calc((100% - min(100%, var(--document-max-width))) / 2 - 5px))' };

  return (
    <div className="pointer-events-none absolute top-0 h-full w-3 max-[1080px]:hidden" data-side={side} style={style}>
      <div
        aria-label={ariaLabel}
        aria-orientation="vertical"
        className={cn(
          'pointer-events-auto absolute top-0 h-full w-2.5 cursor-col-resize before:absolute before:h-full before:border-l before:border-transparent before:transition-colors hover:before:border-border-strong focus-visible:before:border-border-strong',
          side === 'left' ? 'left-0 before:right-0' : 'right-0 before:left-0'
        )}
        onDoubleClick={onResetLayout}
        onMouseDown={onPointerDown}
        onPointerDown={onPointerDown}
        role="separator"
        tabIndex={0}
      />
    </div>
  );
}

function AnswerSection({
  answerEditorDebugId,
  answerSectionMode,
  blockImageMaxHeightOverride,
  editorAppearanceKey,
  editorNodeId,
  fitBlockImagesToViewport,
  onAnswerImageLoadStateChange,
  onFitBlockImageMetricsChange,
  onAnswerChange,
  reveal
}: AnswerSectionProps & { answerEditorDebugId?: string }) {
  const answerNodeId = getImageClozeAnswerEditorNodeId(editorNodeId);

  return (
    <section
      aria-label="Cloze answer section"
      className={cn(
        'relative flex min-h-0 overflow-hidden pt-3',
        answerSectionMode === 'balanced' ? 'flex-1' : 'flex-[0_0_calc(30dvh+60px)]'
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-px -translate-x-1/2 bg-border [width:min(100%,var(--document-max-width))]"
      />
      <MarkdownEditor
        ariaLabel="Answer editor"
        blockImageMaxHeightOverride={blockImageMaxHeightOverride}
        className="answer-editor-host min-h-0"
        debugId={answerEditorDebugId}
        fitBlockImagesToViewport={fitBlockImagesToViewport}
        hideTitleHeading={false}
        key={`answer-${editorAppearanceKey}`}
        nodeId={answerNodeId}
        onChange={onAnswerChange}
        onFitBlockImageMetricsChange={onFitBlockImageMetricsChange}
        onImageLoadStateChange={onAnswerImageLoadStateChange}
        value={reveal}
      />
    </section>
  );
}

function renderDocumentBodyContent(props: DocumentPanelBodyProps) {
  if (props.emptyState) {
    return (
      <div className="flex min-h-0 flex-1 flex-col py-8">
        <div className="flex min-h-0 flex-1 px-6 max-[1080px]:px-4">
          {props.emptyContent ?? (
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <AppEmptyState description={props.emptyState.description} title={props.emptyState.title} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <MarkdownEditor
        ariaLabel="Prompt editor"
        blockImageMaxHeightOverride={props.sharedBlockImageMaxHeight}
        className="prompt-editor-host"
        contentPaddingBottom={props.editorContentPaddingBottom}
        debugId={props.promptEditorDebugId}
        fitBlockImagesToViewport={props.fitBlockImagesToViewport}
        hideScrollbar={props.editorHideScrollbar}
        hideTitleHeading={props.editorHideTitleHeading}
        key={`prompt-${props.editorAppearanceKey}`}
        lineDiffDecorations={props.editorDiffDecorations}
        nodeId={props.editorNodeId}
        nodeViewState={props.editorNodeViewState}
        onChange={props.onEditorChange}
        onContextMenu={props.onEditorContextMenu}
        onFitBlockImageMetricsChange={props.onPromptImageMetricsChange}
        onImageLoadStateChange={props.onPromptImageLoadStateChange}
        onReady={props.onEditorReady}
        readOnly={props.readOnly}
        value={props.editorContent}
      />
    </div>
  );
}

function renderAnswerSection(props: DocumentPanelBodyProps) {
  if (!props.hasAnswerSection || props.emptyState) {
    return null;
  }

  return (
    <AnswerSection
      answerEditorDebugId={props.answerEditorDebugId}
      answerSectionMode={props.answerSectionMode ?? 'fixed'}
      blockImageMaxHeightOverride={props.sharedBlockImageMaxHeight}
      editorAppearanceKey={props.editorAppearanceKey}
      editorNodeId={props.editorNodeId}
      fitBlockImagesToViewport={props.fitBlockImagesToViewport}
      onAnswerImageLoadStateChange={props.onAnswerImageLoadStateChange}
      onFitBlockImageMetricsChange={props.onAnswerImageMetricsChange}
      onAnswerChange={props.onAnswerChange}
      reveal={props.reveal}
    />
  );
}

function renderDocumentOutline(props: DocumentPanelBodyProps) {
  if (props.emptyState || props.showDocumentOutline === false) {
    return null;
  }

  return (
    <DocumentOutlineLayer
      content={props.editorContent}
      documentMaxWidth={props.documentMaxWidth}
      onRevealPosition={props.onRevealDocumentPosition}
      onResolveDocumentPositionAtViewportY={props.onResolveDocumentPositionAtViewportY}
    />
  );
}

function renderDocumentBodyLayout(props: DocumentPanelBodyProps) {
  return (
    <div className="relative flex h-full min-h-0 w-full" data-resizing={props.isDocumentResizing}>
      {renderDocumentOutline(props)}
      <div className="document-panel-editor-stack flex h-full min-h-0 w-full flex-1 flex-col">
        {renderDocumentBodyContent(props)}
        {renderAnswerSection(props)}
      </div>
      {props.showDocumentResizeHandles === false ? null : (
        <>
          <DocumentWidthHandle
            ariaLabel="Resize document width from left"
            onPointerDown={(event) => props.onStartDocumentResize('left', event)}
            onResetLayout={props.onResetLayout}
            side="left"
          />
          <DocumentWidthHandle
            ariaLabel="Resize document width from right"
            onPointerDown={(event) => props.onStartDocumentResize('right', event)}
            onResetLayout={props.onResetLayout}
            side="right"
          />
        </>
      )}
    </div>
  );
}

export function computeSharedBlockImageMaxHeight({
  availableHeight,
  answerMetrics,
  promptMetrics
}: {
  availableHeight: number;
  answerMetrics: BlockImageMetrics | null;
  promptMetrics: BlockImageMetrics | null;
}) {
  const promptImageCount = promptMetrics?.imageCount ?? 0;
  const answerImageCount = answerMetrics?.imageCount ?? 0;
  const totalImageCount = promptImageCount + answerImageCount;

  if (availableHeight <= 0 || totalImageCount <= 0) {
    return undefined;
  }

  const totalNonImageHeight = (promptMetrics?.nonImageHeight ?? 0) + (answerMetrics?.nonImageHeight ?? 0);
  return Math.max(120, Math.floor((availableHeight - totalNonImageHeight - 16) / totalImageCount));
}

export function DocumentPanelBody({
  answerEditorDebugId = 'answer-editor',
  answerSectionMode = 'fixed',
  promptEditorDebugId = 'prompt-editor',
  showDocumentOutline = true,
  showDocumentResizeHandles = true,
  ...props
}: DocumentPanelBodyProps) {
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const [layoutHeight, setLayoutHeight] = useState(0);
  const [promptImageMetrics, setPromptImageMetrics] = useState<BlockImageMetrics | null>(null);
  const [answerImageMetrics, setAnswerImageMetrics] = useState<BlockImageMetrics | null>(null);
  const [promptImageState, setPromptImageState] = useState({ loadedCount: 0, totalCount: 0 });
  const [answerImageState, setAnswerImageState] = useState({ loadedCount: 0, totalCount: 0 });

  useEffect(() => {
    const element = layoutRef.current;
    if (!element) {
      return;
    }

    const updateHeight = () => {
      const stack = element.querySelector('.document-panel-editor-stack') as HTMLElement | null;
      const nextHeight = (stack ?? element).getBoundingClientRect().height;
      setLayoutHeight((current) => (Math.abs(current - nextHeight) < 1 ? current : nextHeight));
    };

    updateHeight();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const sharedBlockImageMaxHeight = useMemo(() => {
    return computeSharedBlockImageMaxHeight({
      answerMetrics: answerImageMetrics,
      availableHeight: layoutHeight,
      promptMetrics: promptImageMetrics
    });
  }, [answerImageMetrics, layoutHeight, promptImageMetrics]);
  const handlePromptImageLoadStateChange = useCallback(
    (state: { loadedCount: number; totalCount: number }) => setPromptImageState(state),
    []
  );
  const handleAnswerImageLoadStateChange = useCallback(
    (state: { loadedCount: number; totalCount: number }) => setAnswerImageState(state),
    []
  );

  useEffect(() => {
    setPromptImageState({ loadedCount: 0, totalCount: 0 });
    setAnswerImageState({ loadedCount: 0, totalCount: 0 });
  }, [props.editorContent, props.editorNodeId, props.reveal]);

  useEffect(() => {
    props.onPromptImageLoadStateChange?.({
      loadedCount: promptImageState.loadedCount + answerImageState.loadedCount,
      totalCount: promptImageState.totalCount + answerImageState.totalCount
    });
  }, [answerImageState, promptImageState, props.onPromptImageLoadStateChange]);

  const bodyProps: DocumentPanelBodyProps = {
    answerEditorDebugId,
    answerSectionMode,
    onAnswerImageLoadStateChange: handleAnswerImageLoadStateChange,
    onAnswerImageMetricsChange: setAnswerImageMetrics,
    onPromptImageLoadStateChange: handlePromptImageLoadStateChange,
    onPromptImageMetricsChange: setPromptImageMetrics,
    promptEditorDebugId,
    sharedBlockImageMaxHeight,
    showDocumentOutline,
    showDocumentResizeHandles,
    ...props
  };

  return (
    <div
      className={cn('flex min-h-0 flex-1 pl-4 pr-0 pt-4 pb-0 max-[1080px]:pl-2 max-[1080px]:pr-0 max-[1080px]:pt-2 max-[1080px]:pb-0')}
      ref={layoutRef}
    >
      {renderDocumentBodyLayout(bodyProps)}
    </div>
  );
}
