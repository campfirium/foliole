import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../../src/app/styles.css';
import '../../src/companion/companionMinimal.css';
import { CompanionBottomReviewBar } from '../../src/companion/CompanionBottomReviewBar';
import { CompanionColorModeProvider } from '../../src/companion/CompanionColorModeProvider';
import { CompanionDraftProvider } from '../../src/companion/CompanionDraftProvider';
import { ReadableArticleDocument } from '../../src/companion/CompanionReadableArticleDocument';
import { ImmersiveReadableArticle } from '../../src/companion/CompanionReadableArticleSurface';
import { MouseGestureSettingsProvider } from '../../src/features/settings/context/MouseGestureSettingsProvider';
import { LocalizationProvider } from '../../src/shared/localization/LocalizationProvider';
import type { CompanionContentSaveHandler } from '../../src/shared/platform/companion/editing/companionContentEditContract';

function EditingReview({ content, answer }: { content: string; answer: string }) {
  const [editing, setEditing] = useState(false);
  const [save] = useState<CompanionContentSaveHandler>(() => Object.assign(
    async (_id: string, next: string) => ({ content: next, reveal: answer, currentVersionId: 'base', submittedVersionId: 'base' }),
    { readSource: async () => ({ content, reveal: answer, versionId: 'base' }) }
  ));
  return <><button onClick={() => setEditing(true)}>Edit item</button>
    <div style={{ height: 300, display: 'flex', flexDirection: 'column' }}>
      <ReadableArticleDocument isReviewItem allowContentEditing={editing} onSaveContent={save}
        answer={answer} scrollContainer="outer"
        readableArticle={{ nodeId: 'review-item', content, title: 'Question', hideTitleHeading: false,
          persistedNodeViewState: null, pdfAttachmentId: null, textAnchorDecorations: [] }}
        readingTypographySettings={{ contrast: 'default', fontFamily: 'sans', fontSize: 'default', lineHeight: 'default' }} />
    </div></>;
}

const wideImage = 'data:image/svg+xml;base64,' + btoa(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#457777"/></svg>'
);

function Review() {
  const params = new URLSearchParams(location.search);
  const long = Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1}. Content continues.`).join('\n\n');
  const content = params.get('question') === 'image' ? `![Question illustration](${wideImage})` : params.has('question') ? long : 'How do you check Flow history?';
  const answer = params.get('answer') === 'image' ? `![Answer illustration](${wideImage})` : params.has('answer') ? long : 'Process entries, then undo and redo and verify the displayed entry.';
  const [revealed, setRevealed] = useState(!params.has('hidden'));
  const [grade, setGrade] = useState<number | null>(null);
  return <LocalizationProvider initialLanguagePreference="en"><CompanionColorModeProvider><MouseGestureSettingsProvider><CompanionDraftProvider>
    {params.has('editing') ? <EditingReview content={content} answer={answer} /> : <>
    <ImmersiveReadableArticle flow isReviewItem answer={revealed ? answer : null} header={<span>Flow practice</span>}
      onExit={() => {}} snapshot={null}
      readableArticle={{ nodeId: 'review-item', content, title: 'Question', hideTitleHeading: false,
        persistedNodeViewState: null, pdfAttachmentId: null, textAnchorDecorations: [] }}
      footer={<CompanionBottomReviewBar visible hasAnswer itemKind="fsrs" isAnswerRevealed={revealed}
        onRevealAnswer={() => setRevealed(true)} onGrade={setGrade} onReadReviewTopic={() => {}}
        onPostponeReviewTopic={() => {}} onDismissReviewTopic={() => {}} reviewCardKey="review-item" />} />
    <output aria-label="Submitted grade">{grade ?? 'None'}</output>
    </>}
  </CompanionDraftProvider></MouseGestureSettingsProvider></CompanionColorModeProvider></LocalizationProvider>;
}

createRoot(document.getElementById('root')!).render(<Review />);
