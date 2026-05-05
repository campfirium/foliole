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

interface DocumentPanelBodyProps {
  answerEditorDebugId?: string;
  documentMaxWidth: number;
  editorAppearanceKey: string;
  editorContent: string;
  editorContentPaddingBottom?: string;
  editorImageMaxWidth?: string;
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
  onEditorChange: (content: string) => void;
  onEditorContextMenu?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onEditorReady?: (adapter: EditorAdapter | null) => void;
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
  showDocumentOutline?: boolean;
  showDocumentResizeHandles?: boolean;
}

interface DocumentWidthHandleProps {
  ariaLabel: string;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>) => void;
  onResetLayout: () => void;
  side: ResizeSide;
}

interface AnswerSectionProps {
  editorAppearanceKey: string;
  editorNodeId: string | null;
  imageMaxWidth?: string;
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
  editorAppearanceKey,
  editorNodeId,
  imageMaxWidth,
  onAnswerChange,
  reveal
}: AnswerSectionProps & { answerEditorDebugId?: string }) {
  const answerNodeId = getImageClozeAnswerEditorNodeId(editorNodeId);

  return (
    <section aria-label="Cloze answer section" className="relative flex min-h-0 flex-[0_0_calc(30dvh+60px)] overflow-hidden pt-3">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-px -translate-x-1/2 bg-border [width:min(100%,var(--document-max-width))]"
      />
      <MarkdownEditor
        ariaLabel="Answer editor"
        className="answer-editor-host min-h-0"
        debugId={answerEditorDebugId}
        hideTitleHeading={false}
        imageMaxWidth={imageMaxWidth}
        key={`answer-${editorAppearanceKey}`}
        nodeId={answerNodeId}
        onChange={onAnswerChange}
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
        className="prompt-editor-host"
        contentPaddingBottom={props.editorContentPaddingBottom}
        debugId={props.promptEditorDebugId}
        hideScrollbar={props.editorHideScrollbar}
        hideTitleHeading={props.editorHideTitleHeading}
        imageMaxWidth={props.editorImageMaxWidth}
        key={`prompt-${props.editorAppearanceKey}`}
        lineDiffDecorations={props.editorDiffDecorations}
        nodeId={props.editorNodeId}
        nodeViewState={props.editorNodeViewState}
        onChange={props.onEditorChange}
        onContextMenu={props.onEditorContextMenu}
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
      editorAppearanceKey={props.editorAppearanceKey}
      editorNodeId={props.editorNodeId}
      imageMaxWidth={props.editorImageMaxWidth}
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
      <div className="flex h-full min-h-0 w-full flex-1 flex-col">
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

export function DocumentPanelBody({
  answerEditorDebugId = 'answer-editor',
  promptEditorDebugId = 'prompt-editor',
  showDocumentOutline = true,
  showDocumentResizeHandles = true,
  ...props
}: DocumentPanelBodyProps) {
  const bodyProps: DocumentPanelBodyProps = {
    answerEditorDebugId,
    promptEditorDebugId,
    showDocumentOutline,
    showDocumentResizeHandles,
    ...props
  };

  return (
    <div className={cn('flex min-h-0 flex-1 pl-4 pr-0 pt-4 pb-0 max-[1080px]:pl-2 max-[1080px]:pr-0 max-[1080px]:pt-2 max-[1080px]:pb-0')}>
      {renderDocumentBodyLayout(bodyProps)}
    </div>
  );
}
