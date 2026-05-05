import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { MarkdownEditor } from '../../features/editor/components/MarkdownEditor';
import { cn } from '../../shared/lib/utils';
import { AppEmptyState } from '../../shared/ui';
import type { NodeViewState } from '../../store/workspaceStore';
import type { ResizeSide } from '../hooks/useDocumentWidthResizer';

interface DocumentPanelBodyProps {
  editorAppearanceKey: string;
  editorContent: string;
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
  onEditorContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onEditorReady: (adapter: EditorAdapter | null) => void;
  onResetLayout: () => void;
  onStartDocumentResize: (
    side: ResizeSide,
    event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>
  ) => void;
  reveal: string;
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

function AnswerSection({ editorAppearanceKey, editorNodeId, onAnswerChange, reveal }: AnswerSectionProps) {
  return (
    <section aria-label="Cloze answer section" className="relative flex min-h-0 flex-[0_0_calc(30dvh+60px)] overflow-hidden pt-3">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-px -translate-x-1/2 bg-border [width:min(100%,var(--document-max-width))]"
      />
      <MarkdownEditor
        ariaLabel="Answer editor"
        className="answer-editor-host min-h-0"
        debugId="answer-editor"
        key={`answer-${editorAppearanceKey}`}
        nodeId={editorNodeId}
        onChange={onAnswerChange}
        value={reveal}
      />
    </section>
  );
}

function renderDocumentBodyContent(props: DocumentPanelBodyProps) {
  if (props.emptyState) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-8">
        <AppEmptyState description={props.emptyState.description} title={props.emptyState.title} />
      </div>
    );
  }

  return (
    <div className="min-h-0 w-full flex-1" onContextMenu={props.onEditorContextMenu}>
      <MarkdownEditor
        ariaLabel="Prompt editor"
        className="prompt-editor-host"
        debugId="prompt-editor"
        key={`prompt-${props.editorAppearanceKey}`}
        nodeId={props.editorNodeId}
        nodeViewState={props.editorNodeViewState}
        onChange={props.onEditorChange}
        onReady={props.onEditorReady}
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
      editorAppearanceKey={props.editorAppearanceKey}
      editorNodeId={props.editorNodeId}
      onAnswerChange={props.onAnswerChange}
      reveal={props.reveal}
    />
  );
}

export function DocumentPanelBody({
  editorAppearanceKey,
  editorContent,
  editorNodeId,
  editorNodeViewState,
  emptyState,
  hasAnswerSection,
  isDocumentResizing,
  onAnswerChange,
  onEditorChange,
  onEditorContextMenu,
  onEditorReady,
  onResetLayout,
  onStartDocumentResize,
  reveal
}: DocumentPanelBodyProps) {
  const bodyProps = {
    editorAppearanceKey,
    editorContent,
    editorNodeId,
    editorNodeViewState,
    emptyState,
    hasAnswerSection,
    isDocumentResizing,
    onAnswerChange,
    onEditorChange,
    onEditorContextMenu,
    onEditorReady,
    onResetLayout,
    onStartDocumentResize,
    reveal
  };

  return (
    <div className="flex min-h-0 flex-1 pl-4 pr-0 pt-4 pb-0 max-[1080px]:pl-2 max-[1080px]:pr-0 max-[1080px]:pt-2 max-[1080px]:pb-0">
      <div className="relative flex h-full min-h-0 w-full" data-resizing={isDocumentResizing}>
        <div className="flex h-full min-h-0 w-full flex-1 flex-col">
          {renderDocumentBodyContent(bodyProps)}
          {renderAnswerSection(bodyProps)}
        </div>
        <DocumentWidthHandle
          ariaLabel="Resize document width from left"
          onPointerDown={(event) => onStartDocumentResize('left', event)}
          onResetLayout={onResetLayout}
          side="left"
        />
        <DocumentWidthHandle
          ariaLabel="Resize document width from right"
          onPointerDown={(event) => onStartDocumentResize('right', event)}
          onResetLayout={onResetLayout}
          side="right"
        />
      </div>
    </div>
  );
}
