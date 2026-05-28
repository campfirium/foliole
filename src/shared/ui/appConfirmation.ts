export interface AppConfirmationOptions {
  cancelLabel?: string;
  confirmLabel?: string;
  description?: string | string[];
  title: string;
}

export interface AppTextInputOptions extends AppConfirmationOptions {
  defaultValue?: string;
  inputLabel: string;
  placeholder?: string;
}

type AppConfirmationHandler = (options: AppConfirmationOptions) => Promise<boolean>;
type AppTextInputHandler = (options: AppTextInputOptions) => Promise<string | null>;

let activeHandler: AppConfirmationHandler | null = null;
let activeTextInputHandler: AppTextInputHandler | null = null;

export function registerAppConfirmationHandler(handler: AppConfirmationHandler) {
  activeHandler = handler;
  return () => {
    if (activeHandler === handler) {
      activeHandler = null;
    }
  };
}

export function requestAppConfirmation(options: AppConfirmationOptions) {
  return activeHandler ? activeHandler(options) : Promise.resolve(false);
}

export function registerAppTextInputHandler(handler: AppTextInputHandler) {
  activeTextInputHandler = handler;
  return () => {
    if (activeTextInputHandler === handler) {
      activeTextInputHandler = null;
    }
  };
}

export function requestAppTextInput(options: AppTextInputOptions) {
  return activeTextInputHandler ? activeTextInputHandler(options) : Promise.resolve(null);
}
