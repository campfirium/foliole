import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../../src/app/styles.css';
import '../../src/companion/companionMinimal.css';
import { CompanionBottomReviewBar } from '../../src/companion/CompanionBottomReviewBar';
import { CompanionColorModeProvider } from '../../src/companion/CompanionColorModeProvider';
import { CompanionDraftProvider } from '../../src/companion/CompanionDraftProvider';
import { ImmersiveReadableArticle } from '../../src/companion/CompanionReadableArticleSurface';
import { MouseGestureSettingsProvider } from '../../src/features/settings/context/MouseGestureSettingsProvider';
import { LocalizationProvider } from '../../src/shared/localization/LocalizationProvider';

function Review() {
  const params = new URLSearchParams(location.search);
  const long = Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1}. Content continues.`).join('\n\n');
  const content = params.has('question') ? long : 'How do you check Flow history?';
  const answer = params.has('answer') ? long : 'Process entries, then undo and redo and verify the displayed entry.';
  const [revealed, setRevealed] = useState(!params.has('hidden'));
  const [grade, setGrade] = useState<number | null>(null);
  return <LocalizationProvider initialLanguagePreference="en"><CompanionColorModeProvider><MouseGestureSettingsProvider><CompanionDraftProvider>
    <ImmersiveReadableArticle flow isReviewItem answer={revealed ? answer : null} header={<span>Flow practice</span>}
      onExit={() => {}} snapshot={null}
      readableArticle={{ nodeId: 'review-item', content, title: 'Question', hideTitleHeading: false,
        persistedNodeViewState: null, pdfAttachmentId: null, textAnchorDecorations: [] }}
      footer={<CompanionBottomReviewBar visible hasAnswer itemKind="fsrs" isAnswerRevealed={revealed}
        onRevealAnswer={() => setRevealed(true)} onGrade={setGrade} onReadReviewTopic={() => {}}
        onPostponeReviewTopic={() => {}} onDismissReviewTopic={() => {}} reviewCardKey="review-item" />} />
    <output aria-label="Submitted grade">{grade ?? 'None'}</output>
  </CompanionDraftProvider></MouseGestureSettingsProvider></CompanionColorModeProvider></LocalizationProvider>;
}

createRoot(document.getElementById('root')!).render(<Review />);
