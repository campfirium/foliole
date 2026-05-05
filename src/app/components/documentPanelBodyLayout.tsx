import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';

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

export interface BlockImageMetrics {
  imageCount: number;
  nonImageHeight: number;
}

export interface DocumentPanelBodyLayoutProps {
  answerEditorDebugId?: string;
  answerSectionMode?: 'balanced' | 'fixed';
  documentMaxWidth: number;
  editorAppearanceKey: string;
  editorContent: string;
  editorContentPaddingBottom?: string;
  editorDiffDecorations?: EditorDiffDecorations | null;
  editorHideScrollbar?: boolean;
  editorHideTitleHeading?: boolean;
  editorNodeId: string | null;
  editorNodeViewState?: NodeViewState;
  emptyContent?: ReactNode;
  emptyState?: {
    description: string;
    title: string;
  };
  fitBlockImagesToViewport?: boolean;
  hasAnswerSection: boolean;
  isDocumentResizing: boolean;
  onAnswerChange: (answer: string) => void;
  onAnswerImageLoadStateChange?: (state: { loadedCount: number; totalCount: number }) => void;
  onEditorChange: (content: string) => void;
  onEditorContextMenu?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onEditorReady?: (adapter: EditorAdapter | null) => void;
  onPromptImageLoadStateChange?: (state: { loadedCount: number; totalCount: number }) => void;
  onPromptImageMetricsChange?: (metrics: BlockImageMetrics | null) => void;
  onAnswerImageMetricsChange?: (metrics: BlockImageMetrics | null) => void;
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

interface DocumentWidthHandleProps {
  ariaLabel: string;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>) => void;
  onResetLayout: () => void;
  side: ResizeSide;
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

function AnswerSection(props: DocumentPanelBodyLayoutProps) {
  const answerNodeId = getImageClozeAnswerEditorNodeId(props.editorNodeId);

  return (
    <section
      aria-label="Cloze answer section"
      className={cn(
        'relative flex min-h-0 overflow-hidden pt-3',
        props.answerSectionMode === 'balanced' ? 'flex-1' : 'flex-[0_0_calc(30dvh+60px)]'
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-px -translate-x-1/2 bg-border [width:min(100%,var(--document-max-width))]"
      />
      <MarkdownEditor
        ariaLabel="Answer editor"
        blockImageMaxHeightOverride={props.sharedBlockImageMaxHeight}
        className="answer-editor-host min-h-0"
        debugId={props.answerEditorDebugId}
        fitBlockImagesToViewport={props.fitBlockImagesToViewport}
        hideTitleHeading={false}
        key={`answer-${props.editorAppearanceKey}`}
        nodeId={answerNodeId}
        onChange={props.onAnswerChange}
        onFitBlockImageMetricsChange={props.onAnswerImageMetricsChange}
        onImageLoadStateChange={props.onAnswerImageLoadStateChange}
        value={props.reveal}
      />
    </section>
  );
}

function renderDocumentBodyContent(props: DocumentPanelBodyLayoutProps) {
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

function renderDocumentOutline(props: DocumentPanelBodyLayoutProps) {
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

export function renderDocumentPanelBodyLayout(props: DocumentPanelBodyLayoutProps) {
  return (
    <div className="relative flex h-full min-h-0 w-full" data-resizing={props.isDocumentResizing}>
      {renderDocumentOutline(props)}
      <div className="document-panel-editor-stack flex h-full min-h-0 w-full flex-1 flex-col">
        {renderDocumentBodyContent(props)}
        {props.hasAnswerSection && !props.emptyState ? <AnswerSection {...props} /> : null}
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
