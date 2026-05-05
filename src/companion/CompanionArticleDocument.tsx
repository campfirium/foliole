import type { EditorTextAnchorDecoration } from '../features/editor/adapters/EditorAdapter';
import { MarkdownEditor } from '../features/editor/components/MarkdownEditor';

export function CompanionArticleDocument(props: {
  content: string;
  hideTitleHeading?: boolean;
  nodeId: string;
  textAnchorDecorations?: readonly EditorTextAnchorDecoration[];
}) {
  return (
    <section className="min-h-[calc(100dvh-9rem)] pt-1">
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
