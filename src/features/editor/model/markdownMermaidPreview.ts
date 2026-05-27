export const MARKDOWN_MERMAID_PREVIEW_EVENT = 'foliole:markdown-mermaid-preview';

export interface MarkdownMermaidPreviewRequest {
  source: string;
}

export function dispatchMarkdownMermaidPreviewRequest(target: HTMLElement, detail: MarkdownMermaidPreviewRequest) {
  target.dispatchEvent(
    new CustomEvent<MarkdownMermaidPreviewRequest>(MARKDOWN_MERMAID_PREVIEW_EVENT, {
      bubbles: true,
      composed: true,
      detail
    })
  );
}
