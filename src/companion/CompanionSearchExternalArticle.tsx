import { useTranslation } from '../shared/localization/LocalizationProvider';
import type { CompanionExternalDocumentSearchResult } from '../shared/platform/companionExternalDocuments';
import { AppButton } from '../shared/ui';

import { useCompanionArticleExit } from './CompanionArticleTransition';
import { toReadableExternalArticle } from './CompanionDirectoryExternalArticle';
import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';
import type { CompanionSearchMatch } from './companionSearchMatch';
import { useCompanionExternalDocument } from './useCompanionExternalDirectory';

export function CompanionSearchExternalArticle(props: {
  document: Pick<CompanionExternalDocumentSearchResult, 'document_id'>;
  searchMatch?: CompanionSearchMatch | null | undefined;
  onExit(): void;
}) {
  const t = useTranslation();
  const exitPending = useCompanionArticleExit(props.onExit);
  const document = useCompanionExternalDocument(props.document.document_id);
  if (document) return (
    <ImmersiveReadableArticle searchMatch={props.searchMatch} onExit={props.onExit}
      readableArticle={toReadableExternalArticle(document)} snapshot={null} />
  );
  return <section className="fixed inset-0 z-surface-raised bg-companion-base px-4 pt-12">
    <AppButton onClick={exitPending} variant="ghost">{t('companion.back')}</AppButton>
    <p role="status">{t(document === null ? 'companion.search.unavailable' : 'companion.search.loading')}</p>
  </section>;
}
