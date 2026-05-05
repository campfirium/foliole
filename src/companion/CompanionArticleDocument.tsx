import type { EditorTextAnchorDecoration } from '../features/editor/adapters/EditorAdapter';
import { MarkdownEditor } from '../features/editor/components/MarkdownEditor';

import { cn } from '@/shared/lib/utils';

export function CompanionArticleDocument(props: {
  content: string;
  hideTitleHeading?: boolean;
  layout?: 'article' | 'review';
  nodeId: string;
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
        onChange={() => undefined}
        readOnly
        textAnchorDecorations={props.textAnchorDecorations}
        value={props.content}
      />
    </section>
  );
}
