import { MarkdownEditor } from '../features/editor/components/MarkdownEditor';

export function CompanionArticleDocument(props: { content: string; nodeId: string }) {
  return (
    <section className="min-h-[calc(100dvh-10rem)] pt-1">
      <MarkdownEditor
        blockImageWidthOverride="min(100%, 40rem)"
        className="h-full"
        hideScrollbar
        nodeId={props.nodeId}
        onChange={() => undefined}
        readOnly
        value={props.content}
      />
    </section>
  );
}
