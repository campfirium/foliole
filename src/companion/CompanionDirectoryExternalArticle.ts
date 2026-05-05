import type { loadCompanionExternalDocument } from '../shared/platform/companionExternalDocuments';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';

type ExternalDocument = NonNullable<Awaited<ReturnType<typeof loadCompanionExternalDocument>>>;

export function toReadableExternalArticle(document: ExternalDocument): CompanionReadableArticle {
  return {
    bodyStatus: document.bodyStatus,
    content: document.content,
    hideTitleHeading: false,
    nodeId: document.document_id,
    persistedNodeViewState: null,
    pdfAttachmentId: null,
    textAnchorDecorations: [],
    title: document.title
  };
}
