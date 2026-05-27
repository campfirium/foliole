import { useEffect, useState } from 'react';

import {
  dismissSearchEnhancementPrompt,
  dismissSearchEnhancementPromptIfEnabled,
  isSearchEnhancementEnabled,
  isSearchEnhancementPromptDismissed,
  setSearchEnhancementEnabled
} from '../../shared/platform/searchEnhancementSettings';
import {
  AppButton,
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../../shared/ui';

type PromptState = 'hidden' | 'prompt' | 'restart';
interface SearchEnhancementPromptContentProps {
  error: string | null;
  onSkip: () => void;
  onTurnOn: () => void;
}
interface SearchEnhancementRestartContentProps {
  error: string | null;
  onDone: () => void;
}

function initialPromptState(): PromptState {
  if (isSearchEnhancementEnabled() || isSearchEnhancementPromptDismissed()) {
    return 'hidden';
  }
  return 'prompt';
}

export function SearchPaletteEnhancementPrompt() {
  const [state, setState] = useState<PromptState>(initialPromptState);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      dismissSearchEnhancementPromptIfEnabled();
    } catch {
      // The prompt is advisory; storage failures should not block search.
    }
  }, []);

  if (state === 'hidden') return null;

  const handleTurnOn = () => {
    try {
      setSearchEnhancementEnabled(true);
      dismissSearchEnhancementPrompt();
      setError(null);
      setState('restart');
    } catch {
      setError('Search enhancement could not be turned on.');
    }
  };
  const handleSkip = () => {
    try {
      dismissSearchEnhancementPrompt();
      setError(null);
      setState('hidden');
    } catch {
      setError('Search enhancement prompt could not be skipped.');
    }
  };
  const handleOpenChange = (open: boolean) => {
    if (!open && state === 'prompt') {
      handleSkip();
      return;
    }
    if (!open) {
      setState('hidden');
    }
  };

  return (
    <AppDialog open={state !== 'hidden'} onOpenChange={handleOpenChange}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="w-[min(440px,calc(100vw-32px))] p-5">
          {state === 'restart' ? (
            <SearchEnhancementRestartContent error={error} onDone={() => setState('hidden')} />
          ) : (
            <SearchEnhancementPromptContent error={error} onSkip={handleSkip} onTurnOn={handleTurnOn} />
          )}
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}

function SearchEnhancementRestartContent(props: SearchEnhancementRestartContentProps) {
  return (
    <>
      <AppDialogTitle>Search enhancement is on</AppDialogTitle>
      <AppDialogDescription className="mt-2">
        Restart to rebuild existing search indexes.
      </AppDialogDescription>
      <div className="mt-5 flex justify-end">
        <AppButton onClick={props.onDone} variant="primary">
          Done
        </AppButton>
      </div>
      {props.error ? <p className="mt-3 text-sm text-error">{props.error}</p> : null}
    </>
  );
}

function SearchEnhancementPromptContent(props: SearchEnhancementPromptContentProps) {
  return (
    <>
      <AppDialogTitle>Turn on search enhancement for languages without spaces?</AppDialogTitle>
      <AppDialogDescription className="mt-2">
        This improves search for Chinese, Japanese, Korean, and other languages that are not separated by spaces. It uses more search index storage. You can change this later in Settings &gt; General.
      </AppDialogDescription>
      <div className="mt-5 flex justify-end gap-2">
        <AppButton onClick={props.onSkip} variant="ghost">
          Skip
        </AppButton>
        <AppButton onClick={props.onTurnOn} variant="primary">
          Turn on
        </AppButton>
      </div>
      {props.error ? <p className="mt-3 text-sm text-error">{props.error}</p> : null}
    </>
  );
}
