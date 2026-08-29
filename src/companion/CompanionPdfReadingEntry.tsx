import { useState } from 'react';

import { isOriginalFilePlaceholderContent } from '../../lib/core/import/filePlaceholderContent';
import { PDF_READER_PLACEHOLDER_TEXT, resolveNodeOpeningText } from '../../lib/core/nodes/nodeOpeningPreview';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppButton } from '../shared/ui';

type PdfReadingArticle = {
  content: string;
  nodeId: string;
  pdfAttachmentId: string | null;
  title: string;
};

export function resolveCompanionPdfReadingEntry(article: PdfReadingArticle) {
  if (!article.pdfAttachmentId) return 'text';
  if (article.content.includes(PDF_READER_PLACEHOLDER_TEXT)) return 'original';
  if (isOriginalFilePlaceholderContent(article.content)) return 'original';
  return resolveNodeOpeningText(article.content, article.title) ? 'text' : 'original';
}

export function useCompanionPdfReadingEntry(article: PdfReadingArticle) {
  const [originalPdfNodeId, setOriginalPdfNodeId] = useState<string | null>(null);
  const hasReadableText = resolveCompanionPdfReadingEntry(article) === 'text';
  const isViewingOriginal = Boolean(
    article.pdfAttachmentId && (!hasReadableText || originalPdfNodeId === article.nodeId)
  );
  return {
    hasReadableText,
    isViewingOriginal,
    onBackToText: () => setOriginalPdfNodeId(null),
    onOpenPdf: () => setOriginalPdfNodeId(article.nodeId)
  };
}

export function CompanionPdfTextVersionToolbar(props: { onOpenPdf(): void }) {
  const t = useTranslation();
  return (
    <div className="mb-3 flex items-center justify-between border-b border-companion-divider px-1 pb-3">
      <span className="text-xs text-companion-text-secondary">{t('companion.reading.textVersion')}</span>
      <AppButton onClick={props.onOpenPdf} variant="ghost">
        {t('companion.reading.openPdf')}
      </AppButton>
    </div>
  );
}
