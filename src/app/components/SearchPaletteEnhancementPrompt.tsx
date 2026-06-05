import { useEffect, useState } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
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

type Translate = ReturnType<typeof useTranslation>;
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
interface SearchEnhancementDialogContentProps {
  error: string | null;
  isUpdating: boolean;
  onDone: () => void;
  onSkip: () => void;
  onTurnOn: () => void;
  state: PromptState;
  status: SearchIndexRebuildStatus | null;
}

function initialPromptState(): PromptState {
  if (isSearchEnhancementEnabled() || isSearchEnhancementPromptDismissed()) {
    return 'hidden';
  }
  return 'prompt';
}

function useSearchEnhancementPromptState() {
  const t = useTranslation();
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

  const handleTurnOn = async () => {
    setIsUpdating(true);
    try {
      const nextStatus = await updateSearchEnhancementEnabled(true);
      dismissSearchEnhancementPrompt();
      setStatus(nextStatus);
      setError(null);
      setState('status');
    } catch {
      setError(t('desktop.searchEnhancement.error.turnOn'));
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
      setError(t('desktop.searchEnhancement.error.skip'));
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

  return {
    error,
    handleDone: () => setState('hidden'),
    handleOpenChange,
    handleSkip,
    handleTurnOn: () => void handleTurnOn(),
    isUpdating,
    state,
    status
  };
}

export function SearchPaletteEnhancementPrompt() {
  const prompt = useSearchEnhancementPromptState();

  if (prompt.state === 'hidden') return null;

  return (
    <AppDialog open onOpenChange={prompt.handleOpenChange}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="w-[min(440px,calc(100vw-32px))] p-5">
          <SearchEnhancementDialogContent
            error={prompt.error}
            isUpdating={prompt.isUpdating}
            onDone={prompt.handleDone}
            onSkip={prompt.handleSkip}
            onTurnOn={prompt.handleTurnOn}
            state={prompt.state}
            status={prompt.status}
          />
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}

function SearchEnhancementDialogContent(props: SearchEnhancementDialogContentProps) {
  if (props.state === 'status') {
    return <SearchEnhancementRestartContent error={props.error} onDone={props.onDone} status={props.status} />;
  }
  return (
    <SearchEnhancementPromptContent
      error={props.error}
      isUpdating={props.isUpdating}
      onSkip={props.onSkip}
      onTurnOn={props.onTurnOn}
    />
  );
}

function SearchEnhancementRestartContent(props: SearchEnhancementRestartContentProps) {
  const t = useTranslation();
  const message = getPromptStatusCopy(props.status, t);
  return (
    <>
      <AppDialogTitle>{t('desktop.searchEnhancement.status.title')}</AppDialogTitle>
      <AppDialogDescription className="mt-2">
        {message}
      </AppDialogDescription>
      <div className="mt-5 flex justify-end">
        <AppButton onClick={props.onDone} variant="primary">
          {t('desktop.searchEnhancement.done')}
        </AppButton>
      </div>
      {props.error ? <p className="mt-3 text-sm text-error">{props.error}</p> : null}
    </>
  );
}

function SearchEnhancementPromptContent(props: SearchEnhancementPromptContentProps) {
  const t = useTranslation();
  return (
    <>
      <AppDialogTitle>{t('desktop.searchEnhancement.prompt.title')}</AppDialogTitle>
      <AppDialogDescription className="mt-2">
        {t('desktop.searchEnhancement.prompt.description')}
      </AppDialogDescription>
      <div className="mt-5 flex justify-end gap-2">
        <AppButton onClick={props.onSkip} variant="ghost">
          {t('desktop.searchEnhancement.notNow')}
        </AppButton>
        <AppButton disabled={props.isUpdating} onClick={props.onTurnOn} variant="primary">
          {props.isUpdating ? t('desktop.searchEnhancement.turningOn') : t('desktop.searchEnhancement.turnOn')}
        </AppButton>
      </div>
      {props.error ? <p className="mt-3 text-sm text-error">{props.error}</p> : null}
    </>
  );
}

function getPromptStatusCopy(status: SearchIndexRebuildStatus | null, t: Translate) {
  if (status?.status === 'ready') return t('desktop.searchEnhancement.status.ready');
  if (status?.status === 'failed') return t('desktop.searchEnhancement.status.failed');
  return t('desktop.searchEnhancement.status.preparing');
}
