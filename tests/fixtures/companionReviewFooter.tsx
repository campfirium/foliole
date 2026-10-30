import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../../src/app/styles.css';
import '../../src/companion/companionMinimal.css';
import { CompanionBottomReviewBar } from '../../src/companion/CompanionBottomReviewBar';
import { CompanionColorModeProvider } from '../../src/companion/CompanionColorModeProvider';
import { LocalizationProvider } from '../../src/shared/localization/LocalizationProvider';
import { AppButton } from '../../src/shared/ui/Button';

function ReviewFooterFixture() {
  const params = new URLSearchParams(location.search);
  const kind = params.get('kind') === 'reading' ? 'reading' : 'fsrs';
  const [revealed, setRevealed] = useState(params.get('reveal') !== 'false');
  const [result, setResult] = useState('Ready');
  return <LocalizationProvider initialLanguagePreference="en"><CompanionColorModeProvider>
    <main className="min-h-screen bg-companion-base px-5 text-foreground">
      <h1>Review touch targets</h1>
      <p>A continuous reading surface with quiet review controls.</p>
      <AppButton>Desktop reference</AppButton>
      <output aria-label="Review result">{result}</output>
      <CompanionBottomReviewBar hasAnswer isAnswerRevealed={revealed} itemKind={kind}
        disabled={params.get('disabled') === 'true'}
        onReadReviewTopic={() => setResult('Read')} onPostponeReviewTopic={() => setResult('Later')}
        onDismissReviewTopic={() => setResult('Dismiss')}
        {...(params.get('soon') === 'true' ? { onSoonReviewTopic: () => setResult('Soon') } : {})}
        onGrade={grade => setResult(`Grade ${grade}`)} onRevealAnswer={() => setRevealed(true)}
        reviewCardKey="fixture" statusLabel="Review status" visible />
    </main>
  </CompanionColorModeProvider></LocalizationProvider>;
}

createRoot(document.getElementById('root')!).render(<ReviewFooterFixture />);
