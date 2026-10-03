import { useEffect, useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { loadCompanionExternalDocument, type CompanionExternalDocumentSearchResult } from '../shared/platform/companionExternalDocuments';
import { AppButton } from '../shared/ui';

import { toReadableExternalArticle } from './CompanionDirectoryExternalArticle';
import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';
import type { CompanionSearchMatch } from './companionSearchMatch';

export function CompanionSearchExternalArticle(props: {
  document: CompanionExternalDocumentSearchResult;
  searchMatch?: CompanionSearchMatch | null | undefined;
  onExit(): void;
}) {
  const t = useTranslation();
  const id = props.document.document_id;
  const [loaded, setLoaded] = useState<{ id: string; document: Awaited<ReturnType<typeof loadCompanionExternalDocument>> } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    void loadCompanionExternalDocument(id).then((document) => {
      if (!cancelled) setLoaded({ id, document });
    }).catch(() => { if (!cancelled) setLoaded({ id, document: null }); });
    return () => { cancelled = true; };
  }, [id]);
  if (loaded?.id === id && loaded.document) return (
    <ImmersiveReadableArticle searchMatch={props.searchMatch} onExit={props.onExit}
      readableArticle={toReadableExternalArticle(loaded.document)} snapshot={null} />
  );
  return <section className="fixed inset-0 z-surface-raised bg-companion-base px-4 pt-12">
    <AppButton onClick={props.onExit} variant="ghost">{t('companion.back')}</AppButton>
    <p role="status">{t(loaded?.id === id ? 'companion.search.unavailable' : 'companion.search.loading')}</p>
  </section>;
}
