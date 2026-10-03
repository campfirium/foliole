import type { CompanionExternalDocumentSearchResult } from '../shared/platform/companionExternalDocuments';

import { toReadableExternalArticle } from './CompanionDirectoryExternalArticle';
import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';
import type { CompanionSearchMatch } from './companionSearchMatch';

export function CompanionSearchExternalArticle(props: {
  document: CompanionExternalDocumentSearchResult;
  searchMatch?: CompanionSearchMatch | null | undefined;
  onExit(): void;
}) {
  return (
    <ImmersiveReadableArticle
      searchMatch={props.searchMatch}
      onExit={props.onExit}
      readableArticle={toReadableExternalArticle(props.document)}
      snapshot={null}
    />
  );
}
