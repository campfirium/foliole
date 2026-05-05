import type { CompanionReadableArticle } from './companionReadableArticle';

export function normalizeReadableArticlePayload(value: unknown): CompanionReadableArticle | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const article = (value as Record<string, unknown>).readable_article;
  if (!article || typeof article !== 'object' || Array.isArray(article)) {
    return null;
  }
  const raw = article as Record<string, unknown>;
  if (typeof raw.content !== 'string' || typeof raw.node_id !== 'string' || typeof raw.title !== 'string') {
    return null;
  }
  return {
    bodyStatus: raw.content_status === 'missing' ? 'missing' : 'ready',
    content: raw.content,
    hideTitleHeading: raw.hide_title_heading === true,
    nodeId: raw.node_id,
    pdfAttachmentId: typeof raw.pdf_attachment_id === 'string' && raw.pdf_attachment_id.trim() ? raw.pdf_attachment_id : null,
    textAnchorDecorations: [],
    title: raw.title
  };
}
