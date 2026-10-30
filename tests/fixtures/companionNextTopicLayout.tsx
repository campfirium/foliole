import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../../src/app/styles.css';
import '../../src/companion/companionMinimal.css';
import { CompanionDraftProvider } from '../../src/companion/CompanionDraftProvider';
import { CompanionNextTopicFooter } from '../../src/companion/CompanionNextTopicFooter';
import { ImmersiveReadableArticle } from '../../src/companion/CompanionReadableArticleSurface';
import { MouseGestureSettingsProvider } from '../../src/features/settings/context/MouseGestureSettingsProvider';
import { LocalizationProvider } from '../../src/shared/localization/LocalizationProvider';

const bodies = {
  short: 'A short topic.',
  empty: '',
  long: Array.from({ length: 40 }, (_, index) => `Paragraph ${index + 1}. Reading continues through a long topic.`).join('\n\n')
};

function Reader() {
  const [openedNext, setOpenedNext] = useState(false);
  const length = new URLSearchParams(window.location.search).get('length') ?? 'short';
  const content = openedNext ? 'The next topic.' : bodies[length as keyof typeof bodies] ?? bodies.short;
  return <LocalizationProvider initialLanguagePreference="en"><MouseGestureSettingsProvider><CompanionDraftProvider>
    <ImmersiveReadableArticle key={openedNext ? 'next' : 'first'} onExit={() => {}} snapshot={null}
      footer={<CompanionNextTopicFooter onOpen={() => setOpenedNext(true)} />}
      readableArticle={{ content, hideTitleHeading: false, nodeId: openedNext ? 'next' : 'first',
        persistedNodeViewState: null, pdfAttachmentId: null, textAnchorDecorations: [], title: 'Topic' }} />
  </CompanionDraftProvider></MouseGestureSettingsProvider></LocalizationProvider>;
}

createRoot(document.getElementById('root')!).render(<Reader />);
