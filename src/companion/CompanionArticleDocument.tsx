import type {
  EditorMissingAttachmentResourceHandler,
  EditorAdapter,
  EditorSelection,
  EditorTextAnchorDecoration,
  EditorViewportMode
} from '../features/editor/adapters/EditorAdapter';
import { MarkdownEditor } from '../features/editor/components/MarkdownEditor';
import type { EditorViewState } from '../features/editor/components/markdownEditorTypes';

import { cn } from '@/shared/lib/utils';

export function CompanionArticleDocument(props: {
  content: string;
  hideTitleHeading?: boolean;
  layout?: 'article' | 'review';
  nodeId: string;
  nodeViewState?: EditorViewState;
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
        hideTitleHeading={props.hideTitleHeading}
        hideScrollbar
        nodeId={props.nodeId}
        nodeViewState={props.nodeViewState}
        onChange={() => undefined}
        onReady={props.onEditorReady}
        onMissingAttachmentResource={props.onMissingAttachmentResource}
        readOnly
        readingSelection={props.readingSelection}
        readingTargetViewportMode={props.readingTargetViewportMode}
        textAnchorDecorations={props.textAnchorDecorations}
        value={props.content}
      />
    </section>
  );
}
