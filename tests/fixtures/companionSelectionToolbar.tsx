import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../../src/app/styles.css';
import '../../src/companion/companionMinimal.css';
import { CompanionArticleDocument } from '../../src/companion/CompanionArticleDocument';
import { CompanionSelectionAnnotationToolbar } from '../../src/companion/CompanionSelectionAnnotationToolbar';
import { useCompanionSelectionAnnotationToolbar } from '../../src/companion/useCompanionSelectionAnnotationToolbar';
import { MouseGestureSettingsProvider } from '../../src/features/settings/context/MouseGestureSettingsProvider';
import { LocalizationProvider } from '../../src/shared/localization/LocalizationProvider';

function Reader() {
  const toolbar = useCompanionSelectionAnnotationToolbar({ canCreateAnnotation: true, nodeId: 'selection-topic', snapshot: null });
  const [saved, setSaved] = useState('');
  return <main className="min-h-screen bg-companion-base p-5 text-foreground">
    <button onClick={toolbar.clearSelectionAndCloseToolbar} type="button">Clear selection</button>
    <CompanionArticleDocument nodeId="selection-topic" scrollContainer="outer"
      content={'# Selection test\n\nSelect this passage and keep the remaining text readable.'}
      onEditorReady={toolbar.handleEditorReady} />
    <output aria-label="Saved annotation">{saved}</output>
    <CompanionSelectionAnnotationToolbar state={toolbar.selectionToolbar}
      onClose={toolbar.clearSelectionAndCloseToolbar} resolveSelectionPayload={toolbar.resolveSelectionPayload}
      onApply={async (_kind, payload) => { setSaved(payload.selectionText); }}
      onAddExistingHighlightNote={() => {}} onDeleteExistingHighlight={() => {}} />
  </main>;
}

createRoot(document.getElementById('root')!).render(
  <LocalizationProvider initialLanguagePreference="en"><MouseGestureSettingsProvider><Reader /></MouseGestureSettingsProvider></LocalizationProvider>
);
