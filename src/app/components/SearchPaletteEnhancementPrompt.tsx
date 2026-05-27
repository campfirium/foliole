import { useEffect, useState } from 'react';

import {
  dismissSearchEnhancementPrompt,
  dismissSearchEnhancementPromptIfEnabled,
  isSearchEnhancementEnabled,
  isSearchEnhancementPromptDismissed,
  updateSearchEnhancementEnabled
} from '../../shared/platform/searchEnhancementSettings';
import {
  onSearchIndexRebuildStatus,
  type SearchIndexRebuildStatus
} from '../../shared/platform/searchIndexRebuildStatus';
import {
  AppButton,
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../../shared/ui';

type PromptState = 'hidden' | 'prompt' | 'status';
interface SearchEnhancementPromptContentProps {
  error: string | null;
  isUpdating: boolean;
  onSkip: () => void;
  onTurnOn: () => void;
}
interface SearchEnhancementRestartContentProps {
  error: string | null;
  onDone: () => void;
  status: SearchIndexRebuildStatus | null;
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
  const [isUpdating, setIsUpdating] = useState(false);
  const [status, setStatus] = useState<SearchIndexRebuildStatus | null>(null);

  useEffect(() => {
    try {
      dismissSearchEnhancementPromptIfEnabled();
    } catch {
      // The prompt is advisory; storage failures should not block search.
    }
  }, []);

  useEffect(() => onSearchIndexRebuildStatus(setStatus), []);

  if (state === 'hidden') return null;

  const handleTurnOn = async () => {
    setIsUpdating(true);
    try {
      const nextStatus = await updateSearchEnhancementEnabled(true);
      dismissSearchEnhancementPrompt();
      setStatus(nextStatus);
      setError(null);
      setState('status');
    } catch {
      setError('Search enhancement could not be turned on.');
    } finally {
      setIsUpdating(false);
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
    <AppDialog open onOpenChange={handleOpenChange}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="w-[min(440px,calc(100vw-32px))] p-5">
          {state === 'status' ? (
            <SearchEnhancementRestartContent error={error} onDone={() => setState('hidden')} status={status} />
          ) : (
            <SearchEnhancementPromptContent error={error} isUpdating={isUpdating} onSkip={handleSkip} onTurnOn={() => void handleTurnOn()} />
          )}
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}

function SearchEnhancementRestartContent(props: SearchEnhancementRestartContentProps) {
  const message = getPromptStatusCopy(props.status);
  return (
    <>
      <AppDialogTitle>Search enhancement is on</AppDialogTitle>
      <AppDialogDescription className="mt-2">
        {message}
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
        <AppButton disabled={props.isUpdating} onClick={props.onTurnOn} variant="primary">
          {props.isUpdating ? 'Turning on...' : 'Turn on'}
        </AppButton>
      </div>
      {props.error ? <p className="mt-3 text-sm text-error">{props.error}</p> : null}
    </>
  );
}

function getPromptStatusCopy(status: SearchIndexRebuildStatus | null) {
  if (status?.status === 'ready') return 'Enhanced search is ready.';
  if (status?.status === 'failed') return 'Could not prepare enhanced search.';
  return 'Preparing enhanced search...';
}
