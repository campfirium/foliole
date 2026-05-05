import type { CompanionReadableArticle } from './companionReadableArticle';

function normalizeBodyStatus(status: unknown) {
  return status === 'missing' || status === 'empty' || status === 'fetching' || status === 'failed' ? status : 'ready';
}

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
    bodyBlobHash: typeof raw.body_blob_hash === 'string' && raw.body_blob_hash.trim() ? raw.body_blob_hash : null,
    bodyStatus: normalizeBodyStatus(raw.content_status),
    content: raw.content,
    hideTitleHeading: raw.hide_title_heading === true,
    nodeId: raw.node_id,
    persistedNodeViewState: null,
    pdfAttachmentId: typeof raw.pdf_attachment_id === 'string' && raw.pdf_attachment_id.trim() ? raw.pdf_attachment_id : null,
    textAnchorDecorations: [],
    title: raw.title
  };
}
