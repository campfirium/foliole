import { FileUp, Mic, Clipboard, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { cn } from '../shared/lib/utils';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import {
  AppDialog,
  AppDialogClose,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle,
  appInputFocusVisibleClassName
} from '../shared/ui';

import type { CompanionCaptureTextSaveError } from './companionCaptureTextController';
import { companionMobileRailClassName } from './companionCssCompatibility';

type CaptureSaveResult = { error: CompanionCaptureTextSaveError } | { nodeId: string };

function CaptureActionRow(props: { icon: LucideIcon; label: string }) {
  const Icon = props.icon;
  return (
    <button
      aria-disabled="true"
      className="flex w-full items-center gap-3 border-b border-companion-divider px-1 py-4 text-left text-foreground disabled:text-companion-text-tertiary"
      disabled
      type="button"
    >
      <Icon className="h-5 w-5" />
      <span className="text-base font-medium">{props.label}</span>
    </button>
  );
}

function CaptureSheetHeader(props: {
  canSave: boolean;
  isSaving: boolean;
  onCancel(): void;
  onSave(): void;
}) {
  const t = useTranslation();
  return (
    <div className="mb-4 flex items-center justify-between">
      <AppDialogClose className="rounded-md px-2 py-1 text-sm font-medium text-companion-text-secondary transition hover:bg-companion-subtle" onClick={props.onCancel}>
        {t('common.cancel')}
      </AppDialogClose>
      <AppDialogTitle>{t('companion.capture.title')}</AppDialogTitle>
      <button
        className="rounded-md px-2 py-1 text-sm font-semibold text-primary transition hover:bg-companion-subtle disabled:text-companion-text-tertiary"
        disabled={!props.canSave}
        onClick={props.onSave}
        type="button"
      >
        {props.isSaving ? t('companion.capture.saving') : t('companion.capture.save')}
      </button>
    </div>
  );
}

function CaptureTextBox(props: {
  draft: string;
  onChange(value: string): void;
}) {
  const t = useTranslation();
  return (
    <div className="rounded-md border border-companion-divider px-4 py-4">
      <button
        aria-disabled="true"
        className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-companion bg-companion-subtle text-companion-text-secondary"
        disabled
        type="button"
      >
        <Mic className="h-5 w-5" />
      </button>
      <textarea
        aria-label={t('companion.capture.text')}
        className={cn(
          'min-h-24 w-full resize-none bg-transparent text-base leading-6 text-foreground placeholder:text-companion-text-tertiary',
          appInputFocusVisibleClassName
        )}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        placeholder={t('companion.capture.placeholder')}
        value={props.draft}
      />
    </div>
  );
}

function resolveCaptureErrorLabel(error: CompanionCaptureTextSaveError | null, t: ReturnType<typeof useTranslation>) {
  if (!error) return null;
  if (error === 'inbox-unavailable') return t('companion.capture.error.inboxUnavailable');
  return t('companion.capture.error.saveFailed');
}

export function CompanionCaptureSheet(props: {
  onSave(text: string): Promise<CaptureSaveResult>;
  onOpenChange(open: boolean): void;
  open: boolean;
}) {
  const { onOpenChange, onSave, open } = props;
  const t = useTranslation();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<CompanionCaptureTextSaveError | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const canSave = draft.trim().length > 0 && !isSaving;
  const errorLabel = resolveCaptureErrorLabel(error, t);

  const resetDraft = useCallback(() => {
    setDraft('');
    setError(null);
    setIsSaving(false);
  }, []);
  const handleDraftChange = useCallback((value: string) => {
    setDraft(value);
    if (error) setError(null);
  }, [error]);
  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) resetDraft();
    onOpenChange(nextOpen);
  }, [onOpenChange, resetDraft]);
  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setIsSaving(true);
    setError(null);
    const result = await onSave(draft);
    if ('error' in result) {
      setError(result.error);
      setIsSaving(false);
      return;
    }
    resetDraft();
    onOpenChange(false);
  }, [canSave, draft, onOpenChange, onSave, resetDraft]);

  useEffect(() => { if (!open) resetDraft(); }, [open, resetDraft]);

  return (
    <AppDialog onOpenChange={handleOpenChange} open={open}>
      <AppDialogPortal>
        <AppDialogOverlay className="companion-sheet-overlay" />
        <AppDialogContent className={`companion-sheet bottom-0 left-0 top-auto w-full translate-x-0 translate-y-0 [transform:translate(0,0)] rounded-b-none rounded-t-xl border-x-0 border-b-0 ${companionMobileRailClassName} pt-3 pb-6 supports-[padding-bottom:max(0px)]:pb-[max(env(safe-area-inset-bottom),24px)]`}>
          <div aria-hidden="true" className="mx-auto mb-3 h-1 w-9 rounded-full bg-companion-divider-strong" />
          <div className="mx-auto w-full max-w-[760px]">
            <CaptureSheetHeader canSave={canSave} isSaving={isSaving} onCancel={resetDraft} onSave={handleSave} />
            <CaptureTextBox draft={draft} onChange={handleDraftChange} />
            {errorLabel ? <p className="mt-3 text-sm text-destructive" role="alert">{errorLabel}</p> : null}
            <div className="mt-5 border-t border-companion-divider">
              <CaptureActionRow icon={Clipboard} label={t('companion.capture.paste')} />
              <CaptureActionRow icon={FileUp} label={t('companion.capture.upload')} />
            </div>
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
