import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useTranslation } from '../localization/LocalizationProvider';

import {
  type AppConfirmationOptions,
  type AppTextInputOptions,
  registerAppConfirmationHandler,
  registerAppTextInputHandler
} from './appConfirmation';
import { AppButton } from './Button';
import {
  AppDialog,
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

type ActiveDialog = ActiveConfirmation | ActiveTextInput;

const AppConfirmationContext = createContext(null);

function normalizeDescription(description: AppConfirmationOptions['description']) {
  if (!description) {
    return [];
  }
  return Array.isArray(description) ? description : [description];
}

export function AppConfirmationProvider({ children }: { children: ReactNode }) {
  const [activeDialog, setActiveDialog] = useState<ActiveDialog | null>(null);
  const requestConfirmation = useCallback((options: AppConfirmationOptions) => {
    return new Promise<boolean>((resolve) => {
      setActiveDialog({ kind: 'confirmation', options, resolve });
    });
  }, []);
  const requestTextInput = useCallback((options: AppTextInputOptions) => {
    return new Promise<string | null>((resolve) => {
      setActiveDialog({ inputValue: options.defaultValue ?? '', kind: 'text-input', options, resolve });
    });
  }, []);
  const contextValue = useMemo(() => null, []);

  useEffect(() => registerAppConfirmationHandler(requestConfirmation), [requestConfirmation]);
  useEffect(() => registerAppTextInputHandler(requestTextInput), [requestTextInput]);

  const closeDialog = useCallback((confirmed: boolean) => {
    setActiveDialog((current) => {
      if (current?.kind === 'confirmation') {
        current.resolve(confirmed);
      }
      if (current?.kind === 'text-input') {
        current.resolve(confirmed ? current.inputValue : null);
      }
      return null;
    });
  }, []);
  const updateInputValue = useCallback((value: string) => {
    setActiveDialog((current) => current?.kind === 'text-input' ? { ...current, inputValue: value } : current);
  }, []);

  const description = normalizeDescription(activeDialog?.options.description);

  return (
    <AppConfirmationContext.Provider value={contextValue}>
      {children}
      <ActiveAppDialog
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
  onClose: (confirmed: boolean) => void;
  onUpdateInputValue: (value: string) => void;
}) {
  return (
    <AppDialog open={Boolean(props.activeDialog)} onOpenChange={(open) => !open && props.onClose(false)}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="w-[min(420px,calc(100vw-32px))] p-5">
          <AppDialogTitle>{props.activeDialog?.options.title}</AppDialogTitle>
          <AppDialogBody
            activeDialog={props.activeDialog}
            description={props.description}
            onClose={props.onClose}
            onUpdateInputValue={props.onUpdateInputValue}
          />
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}

function AppDialogBody(props: {
  activeDialog: ActiveDialog | null;
  description: string[];
  onClose: (confirmed: boolean) => void;
  onUpdateInputValue: (value: string) => void;
}) {
  const t = useTranslation();
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
      <AppTextInputDialogField
        activeDialog={props.activeDialog}
        onClose={props.onClose}
        onUpdateInputValue={props.onUpdateInputValue}
      />
      <div className="mt-5 flex justify-end gap-2">
        <AppButton onClick={() => props.onClose(false)}>
          {props.activeDialog?.options.cancelLabel ?? t('shared.confirm.cancel')}
        </AppButton>
        <AppButton onClick={() => props.onClose(true)} variant="default">
          {props.activeDialog?.options.confirmLabel ?? t('shared.confirm.confirm')}
        </AppButton>
      </div>
    </>
  );
}

function AppTextInputDialogField(props: {
  activeDialog: ActiveDialog | null;
  onClose: (confirmed: boolean) => void;
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
