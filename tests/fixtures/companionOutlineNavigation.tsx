import React from 'react';
import { createRoot } from 'react-dom/client';

import '../../src/app/styles.css';
import '../../src/companion/companionMinimal.css';
import { CompanionColorModeProvider } from '../../src/companion/CompanionColorModeProvider';
import { CompanionDraftProvider } from '../../src/companion/CompanionDraftProvider';
import { ImmersiveReadableArticle } from '../../src/companion/CompanionReadableArticleSurface';
import { MouseGestureSettingsProvider } from '../../src/features/settings/context/MouseGestureSettingsProvider';
import { LocalizationProvider } from '../../src/shared/localization/LocalizationProvider';
import { createExplicitArticleSnapshot, createNodeRecord } from '../../src/shared/platform/companion/reading/companionReadableArticle.testSupport';
import { resolveReadableCompanionArticleByNodeId } from '../../src/shared/platform/companionReadableArticle';

const scenario = new URLSearchParams(window.location.search).get('scenario') ?? 'headings';
const content = [scenario === 'headings' ? '# Source heading' : 'Source text',
  ...Array.from({ length: 16 }, (_, index) => `Context paragraph ${index + 1}. Read the original text in this topic.`),
  'Topic passage in the original text.', 'Item passage in the original text.'].join('\n\n');
const snapshot = createExplicitArticleSnapshot();
Object.assign(snapshot.nodesById, { 'node-1': createNodeRecord({ id: 'node-1', content }) });
for (const kind of ['topic', 'item'] as const) {
  if (scenario === 'empty' || (scenario === 'items' && kind === 'topic')) continue;
  const originalText = kind === 'topic' ? 'Topic passage in the original text.' : 'Item passage in the original text.';
  const from = content.indexOf(originalText);
  Object.assign(snapshot.nodesById, { [kind]: createNodeRecord({
    id: kind, parentNodeId: 'node-1', kind,
    anchorLink: { id: kind, kind: kind === 'topic' ? 'highlight' : 'cloze', locator: { from, to: from + originalText.length, originalText } }
  }) });
}
const article = resolveReadableCompanionArticleByNodeId(snapshot, 'node-1')!;
createRoot(document.getElementById('root')!).render(
  <LocalizationProvider initialLanguagePreference="en"><CompanionColorModeProvider>
    <MouseGestureSettingsProvider><CompanionDraftProvider>
      <ImmersiveReadableArticle onExit={() => {}} snapshot={snapshot} readableArticle={article} />
    </CompanionDraftProvider></MouseGestureSettingsProvider>
  </CompanionColorModeProvider></LocalizationProvider>
);
