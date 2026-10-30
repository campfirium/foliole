import React from 'react';
import { createRoot } from 'react-dom/client';

import '../../src/app/styles.css';
import '../../src/companion/companionMinimal.css';
import { CompanionColorModeProvider } from '../../src/companion/CompanionColorModeProvider';
import { CompanionDraftProvider } from '../../src/companion/CompanionDraftProvider';
import { ImmersiveReadableArticle } from '../../src/companion/CompanionReadableArticleSurface';
import { MouseGestureSettingsProvider } from '../../src/features/settings/context/MouseGestureSettingsProvider';
import { LocalizationProvider } from '../../src/shared/localization/LocalizationProvider';
import type { CompanionContentEdit, CompanionContentSaveHandler, CompanionContentSource } from '../../src/shared/platform/companion/editing/companionContentEditContract';

const params = new URLSearchParams(location.search);
const paragraph = (count: number) => Array.from({ length: count }, (_, i) => `Paragraph ${i + 1}.`).join('\n\n');
const content = params.get('question') === 'long' ? paragraph(35) : 'Short question.';
const reveal = params.get('answer') === 'long' ? paragraph(35) : 'Short answer.';
let source: CompanionContentSource = { content, reveal, versionId: 'base' };
const saveContent = async (_id: string, next: string, edit?: CompanionContentEdit) => {
  source = { content: next, reveal: edit?.reveal ?? source.reveal, versionId: edit?.versionId ?? 'saved' };
  return { content: source.content, reveal: source.reveal, currentVersionId: source.versionId, submittedVersionId: source.versionId };
};
const save: CompanionContentSaveHandler = Object.assign(saveContent, { readSource: async () => source });

createRoot(document.getElementById('root')!).render(
  <LocalizationProvider initialLanguagePreference="en"><CompanionColorModeProvider><MouseGestureSettingsProvider><CompanionDraftProvider>
    <ImmersiveReadableArticle flow isReviewItem answer={reveal} header={<span>Item</span>}
      onExit={() => {}} onSaveArticleContent={save} snapshot={null}
      readableArticle={{ nodeId: 'split-item', title: 'Question', content, currentVersionId: 'base', hideTitleHeading: false,
        persistedNodeViewState: null, pdfAttachmentId: null, textAnchorDecorations: [] }} />
  </CompanionDraftProvider></MouseGestureSettingsProvider></CompanionColorModeProvider></LocalizationProvider>
);
