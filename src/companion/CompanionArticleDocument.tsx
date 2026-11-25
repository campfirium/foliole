import { useCallback, type CSSProperties } from 'react';

import type {
  EditorMissingAttachmentResourceHandler,
  EditorAdapter,
  EditorContentChangeMeta,
  EditorSelection,
  EditorTextAnchorDecoration,
  EditorViewportMode
} from '../features/editor/adapters/EditorAdapter';
import { MarkdownEditor } from '../features/editor/components/MarkdownEditor';
import type { EditorViewState, MarkdownEditorProps } from '../features/editor/components/markdownEditorTypes';
import type { EditorDisplayMode } from '../features/editor/model/editorDisplayMode';

import './companionReadableArticleAnchors.css';
import './companionImageCopy.css';

import { companionArticleMinHeightClassName } from './companionCssCompatibility';
import { useCompanionImageCopy } from './useCompanionImageCopy';

import { definedProps } from '@/shared/lib/definedProps';

interface CompanionArticleDocumentProps {
  content: string;
  ariaLabel?: string;
  /** Fixed per mount; callers key the document by it so a switch remounts the editor. */
  displayMode?: EditorDisplayMode;
  hideTitleHeading?: boolean;
  layout?: 'article' | 'review';
  nodeId: string;
  nodeViewState?: EditorViewState;
  onBlurCapture?: () => void;
  onChange?: (content: string, meta?: EditorContentChangeMeta) => void;
  onDocumentInput?: (meta?: import('../features/editor/adapters/EditorAdapter').EditorContentChangeMeta) => void;
  onEditorReady?: (adapter: EditorAdapter | null) => void;
  onMissingAttachmentResource?: EditorMissingAttachmentResourceHandler;
  onCompleteApplyingReadingPosition?: MarkdownEditorProps['onCompleteApplyingReadingPosition'];
  readingRestoreCommandId?: string | null;
  readingSelection?: EditorSelection | null;
  readingTargetViewportMode?: EditorViewportMode | null;
  scrollContainer?: 'editor' | 'outer';
  textAnchorDecorations?: readonly EditorTextAnchorDecoration[];
}

export function CompanionArticleDocument(props: CompanionArticleDocumentProps) {
  const imageCopy = useCompanionImageCopy(props.nodeId, Boolean(props.onChange) && !props.nodeId.endsWith('::answer'), props.content);
  const onReady = useCallback((adapter: EditorAdapter | null) => {
    imageCopy.onReady(adapter);
    props.onEditorReady?.(adapter);
  }, [imageCopy.onReady, props.onEditorReady]);
  const sectionClassName = props.layout === 'review' || (props.scrollContainer === 'outer' && !props.onChange)
    ? 'pt-1 min-h-0'
    : `pt-1 ${companionArticleMinHeightClassName}`;
  return (
    <section
      className={sectionClassName}
      data-companion-article-document="true"
      data-testid="companion-article-document"
      data-node-id={props.nodeId}
      data-companion-image-copy-enabled={Boolean(props.onChange) && !props.nodeId.endsWith('::answer') ? 'true' : undefined}
      data-companion-readable-document={props.layout === 'review' ? undefined : 'true'}
      style={{ '--document-content-inline-padding': '0px' } as CSSProperties}
      {...imageCopy.handlers}
    >
      <MarkdownEditor
        ariaLabel={props.ariaLabel ?? 'Topic body'}
        blockImageWidthOverride="min(100%, 40rem)"
        className="h-full"
        hideScrollbar
        fullscreenImagePreview
        nodeId={props.nodeId}
        onChange={(content, meta) => props.onChange?.(content, meta)}
        readOnly={!props.onChange}
        readOnlyInteractionMode={!props.onChange ? 'document' : 'editor'}
        value={props.content}
        {...definedProps({
          displayMode: props.displayMode,
          hideTitleHeading: props.hideTitleHeading,
          nodeViewState: props.nodeViewState,
          onBlurCapture: props.onBlurCapture,
          onDocumentInput: props.onDocumentInput,
          onMissingAttachmentResource: props.onMissingAttachmentResource,
          onReady,
          onCompleteApplyingReadingPosition: props.onCompleteApplyingReadingPosition,
          readingRestoreCommandId: props.readingRestoreCommandId,
          readingSelection: props.readingSelection,
          readingTargetViewportMode: props.readingTargetViewportMode,
          scrollContainer: props.scrollContainer,
          textAnchorDecorations: props.textAnchorDecorations
        })}
      />
      {imageCopy.menu}
    </section>
  );
}
