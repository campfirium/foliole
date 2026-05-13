import type {
  EditorMissingAttachmentResourceHandler,
  EditorAdapter,
  EditorSelection,
  EditorTextAnchorDecoration,
  EditorViewportMode
} from '../features/editor/adapters/EditorAdapter';
import { MarkdownEditor } from '../features/editor/components/MarkdownEditor';
import type { EditorViewState } from '../features/editor/components/markdownEditorTypes';

import { definedProps } from '@/shared/lib/definedProps';
import { cn } from '@/shared/lib/utils';

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
  textAnchorDecorations?: readonly EditorTextAnchorDecoration[];
}) {
  return (
    <section className={cn('pt-1', props.layout === 'review' ? 'min-h-0' : 'min-h-[calc(100dvh-9rem)]')}>
      <MarkdownEditor
        blockImageWidthOverride="min(100%, 40rem)"
        className="h-full"
        hideScrollbar
        nodeId={props.nodeId}
        onChange={(content) => props.onChange?.(content)}
        readOnly={!props.onChange}
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
          textAnchorDecorations: props.textAnchorDecorations
        })}
      />
    </section>
  );
}
