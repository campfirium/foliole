import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../../src/app/styles.css';
import '../../src/companion/companionMinimal.css';
import { ImmersiveReadableArticle } from '../../src/companion/CompanionReadableArticleSurface';
import { MouseGestureSettingsProvider } from '../../src/features/settings/context/MouseGestureSettingsProvider';
import { LocalizationProvider } from '../../src/shared/localization/LocalizationProvider';

const content = Array.from({ length: 30 }, (_, index) =>
  `Paragraph ${index + 1}. Reading width keeps this highlighted passage readable. 中文阅读留白随屏幕适配。`
).join('\n\n');
const from = content.indexOf('highlighted passage');
const article = {
  content, hideTitleHeading: false, nodeId: 'reading-width-topic',
  persistedNodeViewState: null, pdfAttachmentId: null, title: 'Reading width',
  textAnchorDecorations: [{ from, to: from + 'highlighted passage'.length, kind: 'highlight' as const }]
};

function Reader() {
  const [open, setOpen] = useState(true);
  return open ? <ImmersiveReadableArticle snapshot={null} readableArticle={article}
    onExit={() => setOpen(false)} />
    : <button type="button" onClick={() => setOpen(true)}>Return to reading</button>;
}

createRoot(document.getElementById('root')!).render(
  <LocalizationProvider initialLanguagePreference="en"><MouseGestureSettingsProvider><Reader /></MouseGestureSettingsProvider></LocalizationProvider>
);
