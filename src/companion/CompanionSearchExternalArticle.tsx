import type { CompanionExternalDocumentSearchResult } from '../shared/platform/companionExternalDocuments';

import { toReadableExternalArticle } from './CompanionDirectoryExternalArticle';
import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';

export function CompanionSearchExternalArticle(props: {
  document: CompanionExternalDocumentSearchResult;
  onExit(): void;
}) {
  return (
    <ImmersiveReadableArticle
      onExit={props.onExit}
      readableArticle={toReadableExternalArticle(props.document)}
      snapshot={null}
    />
  );
}
