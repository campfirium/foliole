export { loadNodeOwnedArticleResourceNeeds as loadArticleAttachmentNeeds } from './nodeOwnedArticleResourceNeeds.js';

export interface ArticleAttachmentNeed {
  attachmentId: string;
  contentHash: string;
  mimeType: string;
  storageKey: string;
  sizeBytes?: number;
}
