import type { CSSProperties } from 'react';

import type {
  EditorMissingAttachmentResourceHandler,
  EditorAdapter,
  EditorSelection,
  EditorTextAnchorDecoration,
  EditorViewportMode
} from '../features/editor/adapters/EditorAdapter';
import { MarkdownEditor } from '../features/editor/components/MarkdownEditor';
import type { EditorViewState } from '../features/editor/components/markdownEditorTypes';

import './companionReadableArticleAnchors.css';

import { companionArticleMinHeightClassName } from './companionCssCompatibility';

import { definedProps } from '@/shared/lib/definedProps';

export function CompanionArticleDocument(props: {
  content: string;
  contentPaddingTop?: string;
  hideTitleHeading?: boolean;
  layout?: 'article' | 'review';
  nodeId: string;
  nodeViewState?: EditorViewState;
  onBlurCapture?: () => void;
  onChange?: (content: string) => void;
  onEditorReady?: (adapter: EditorAdapter | null) => void;
  onMissingAttachmentResource?: EditorMissingAttachmentResourceHandler;
  readingSelection?: EditorSelection | null;
  readingTargetViewportMode?: EditorViewportMode | null;
  scrollContainer?: 'editor' | 'outer';
  textAnchorDecorations?: readonly EditorTextAnchorDecoration[];
}) {
  const sectionClassName = props.layout === 'review'
    ? 'pt-1 min-h-0'
    : `pt-1 ${companionArticleMinHeightClassName}`;
  return (
    <section
      className={sectionClassName}
      data-companion-article-document="true"
      data-companion-readable-document={props.layout === 'review' ? undefined : 'true'}
      style={{ '--document-content-inline-padding': '0px' } as CSSProperties}
    >
      <MarkdownEditor
        ariaLabel="Topic body"
        blockImageWidthOverride="min(100%, 40rem)"
        className="h-full"
        hideScrollbar
        nodeId={props.nodeId}
        onChange={(content) => props.onChange?.(content)}
        readOnly={!props.onChange}
        readOnlyInteractionMode={!props.onChange ? 'document' : 'editor'}
        value={props.content}
        {...definedProps({
          contentPaddingTop: props.contentPaddingTop,
          hideTitleHeading: props.hideTitleHeading,
          nodeViewState: props.nodeViewState,
          onBlurCapture: props.onBlurCapture,
          onMissingAttachmentResource: props.onMissingAttachmentResource,
          onReady: props.onEditorReady,
          readingSelection: props.readingSelection,
          readingTargetViewportMode: props.readingTargetViewportMode,
          scrollContainer: props.scrollContainer,
          textAnchorDecorations: props.textAnchorDecorations
        })}
      />
    </section>
  );
}
