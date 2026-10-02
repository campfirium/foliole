import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useTranslation } from '../localization/LocalizationProvider';

import { registerAppChoiceHandler, type AppChoiceOptions } from './appChoice';
import { AppChoiceDialog } from './AppChoiceDialog';
import {
  type AppConfirmationOptions,
  type AppTextInputOptions,
  registerAppConfirmationHandler,
  registerAppTextInputHandler
} from './appConfirmation';
import { AppNoticeDialog } from './AppNoticeDialog';
import { AppButton } from './Button';
import {
  AppDialogActions,
  AppDialogBody,
  AppDialogContent,
  AppDialogDescription,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from './Dialog';
import { AppInput } from './Input';

interface ActiveConfirmation {
  kind: 'confirmation';
  options: AppConfirmationOptions;
  resolve: (confirmed: boolean) => void;
}

interface ActiveTextInput {
  inputValue: string;
  kind: 'text-input';
  options: AppTextInputOptions;
  resolve: (value: string | null) => void;
}

interface ActiveChoice {
  kind: 'choice';
  options: AppChoiceOptions;
  resolve: (value: string | null) => void;
}

type ActiveDialog = ActiveConfirmation | ActiveTextInput | ActiveChoice;
type QueuedDialog = ActiveDialog & { id: number };

function cancelDialog(dialog: ActiveDialog) {
  if (dialog.kind === 'confirmation') dialog.resolve(false);
  else dialog.resolve(null);
}

const AppConfirmationContext = createContext(null);

function normalizeDescription(description: AppConfirmationOptions['description']) {
  if (!description) {
    return [];
  }
  return Array.isArray(description) ? description : [description];
}

export function AppConfirmationProvider({ children }: { children: ReactNode }) {
  const [activeDialog, setActiveDialog] = useState<QueuedDialog | null>(null);
  const pending = useRef<QueuedDialog[]>([]);
  const requestId = useRef(0);
  const enqueue = useCallback((dialog: ActiveDialog) => {
    pending.current.push({ ...dialog, id: ++requestId.current });
    setActiveDialog(pending.current[0] ?? null);
  }, []);
  const requestConfirmation = useCallback((options: AppConfirmationOptions) => {
    return new Promise<boolean>((resolve) => enqueue({ kind: 'confirmation', options, resolve }));
  }, [enqueue]);
  const requestTextInput = useCallback((options: AppTextInputOptions) => {
    return new Promise<string | null>((resolve) => enqueue({
      inputValue: options.defaultValue ?? '', kind: 'text-input', options, resolve
    }));
  }, [enqueue]);
  const requestChoice = useCallback((options: AppChoiceOptions) => {
    return new Promise<string | null>((resolve) => enqueue({ kind: 'choice', options, resolve }));
  }, [enqueue]);
  const contextValue = useMemo(() => null, []);

  useEffect(() => registerAppConfirmationHandler(requestConfirmation), [requestConfirmation]);
  useEffect(() => registerAppTextInputHandler(requestTextInput), [requestTextInput]);
  useEffect(() => registerAppChoiceHandler(requestChoice), [requestChoice]);
  useEffect(() => () => {
    pending.current.splice(0).forEach(cancelDialog);
  }, []);

  const closeDialog = useCallback((confirmed: boolean, value?: string) => {
    const current = pending.current.shift();
    if (current?.kind === 'confirmation') current.resolve(confirmed);
    if (current?.kind === 'text-input') current.resolve(confirmed ? current.inputValue : null);
    if (current?.kind === 'choice') current.resolve(value ?? null);
    setActiveDialog(pending.current[0] ?? null);
  }, []);
  const updateInputValue = useCallback((value: string) => {
    const current = pending.current[0];
    if (current?.kind !== 'text-input') return;
    pending.current[0] = { ...current, inputValue: value };
    setActiveDialog(pending.current[0]);
  }, []);

  const description = normalizeDescription(activeDialog?.options.description);

  return (
    <AppConfirmationContext.Provider value={contextValue}>
      {children}
      <ActiveAppDialog
        key={activeDialog?.id ?? 'closed'}
        activeDialog={activeDialog}
        description={description}
        onClose={closeDialog}
        onUpdateInputValue={updateInputValue}
      />
    </AppConfirmationContext.Provider>
  );
}

function ActiveAppDialog(props: {
  activeDialog: ActiveDialog | null;
  description: string[];
  onClose: (confirmed: boolean, value?: string) => void;
  onUpdateInputValue: (value: string) => void;
}) {
  const t = useTranslation();
  return (
    <AppNoticeDialog open={Boolean(props.activeDialog)} onOpenChange={(open) => !open && props.onClose(false)}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent layout="notice">
          <AppDialogTitle>{props.activeDialog?.options.title}</AppDialogTitle>
          <AppDialogBody>
            <ActiveDialogBody
              activeDialog={props.activeDialog}
              description={props.description}
              onClose={props.onClose}
              onUpdateInputValue={props.onUpdateInputValue}
            />
          </AppDialogBody>
          <AppDialogActions>
            {(props.activeDialog?.kind === 'choice' || props.activeDialog?.options.cancelLabel !== null) ? (
              <AppButton onClick={() => props.onClose(false)} variant="ghost">
                {(props.activeDialog?.kind === 'choice' ? undefined : props.activeDialog?.options.cancelLabel) ?? t('shared.confirm.cancel')}
              </AppButton>
            ) : null}
            {props.activeDialog?.kind !== 'choice' ? (
              <AppButton onClick={() => props.onClose(true)} variant="default">
                {props.activeDialog?.options.confirmLabel ?? t('shared.confirm.confirm')}
              </AppButton>
            ) : null}
          </AppDialogActions>
        </AppDialogContent>
      </AppDialogPortal>
    </AppNoticeDialog>
  );
}

function ActiveDialogBody(props: {
  activeDialog: ActiveDialog | null;
  description: string[];
  onClose: (confirmed: boolean, value?: string) => void;
  onUpdateInputValue: (value: string) => void;
}) {
  return (
    <>
      {props.description.length > 0 ? (
        <AppDialogDescription className="mt-3 space-y-2">
          {props.description.map((line) => (
            <span className="block" key={line}>
              {line}
            </span>
          ))}
        </AppDialogDescription>
      ) : null}
      {props.activeDialog?.kind === 'choice' ? (
        <AppChoiceDialog options={props.activeDialog.options} onChoose={(value) => props.onClose(true, value)} />
      ) : null}
      <AppTextInputDialogField
        activeDialog={props.activeDialog}
        onClose={props.onClose}
        onUpdateInputValue={props.onUpdateInputValue}
      />
    </>
  );
}

function AppTextInputDialogField(props: {
  activeDialog: ActiveDialog | null;
  onClose: (confirmed: boolean, value?: string) => void;
  onUpdateInputValue: (value: string) => void;
}) {
  if (props.activeDialog?.kind !== 'text-input') {
    return null;
  }
  return (
    <form
      className="mt-4"
      onSubmit={(event) => {
        event.preventDefault();
        props.onClose(true);
      }}
    >
      <label className="sr-only" htmlFor="app-text-input-dialog-field">
        {props.activeDialog.options.inputLabel}
      </label>
      <AppInput
        autoFocus
        id="app-text-input-dialog-field"
        onChange={(event) => props.onUpdateInputValue(event.currentTarget.value)}
        placeholder={props.activeDialog.options.placeholder}
        value={props.activeDialog.inputValue}
      />
    </form>
  );
}
