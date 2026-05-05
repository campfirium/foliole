import type { MarkdownTablePlan } from './markdownTablePlans';

export const MARKDOWN_TABLE_PREVIEW_EVENT = 'foliole:markdown-table-preview';

export interface MarkdownTablePreviewRequest {
  table: MarkdownTablePlan;
}

export function dispatchMarkdownTablePreviewRequest(target: HTMLElement, detail: MarkdownTablePreviewRequest) {
  target.dispatchEvent(
    new CustomEvent<MarkdownTablePreviewRequest>(MARKDOWN_TABLE_PREVIEW_EVENT, {
      bubbles: true,
      composed: true,
      detail
    })
  );
}
