import { buildWorkspaceSearchTextExcerpt } from './workspaceSearchTextExcerpt.js';

export function buildCrossPagePdfExcerpt(currentText: string, nextText: string, matchStart: number, query: string, page: number, endPage: number) {
  const label = `Cross-page match (${page}-${endPage})`;
  const excerpt = buildWorkspaceSearchTextExcerpt(
    currentText + nextText, query, matchStart >= 0 ? matchStart : undefined
  );
  return excerpt ? `${label} · ${excerpt}` : label;
}
