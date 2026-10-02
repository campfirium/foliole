export interface AppChoiceOptions {
  title: string;
  description?: string;
  choices: Array<{ value: string; label: string }>;
}

type ChoiceHandler = (options: AppChoiceOptions) => Promise<string | null>;
let activeHandler: ChoiceHandler | null = null;

export function registerAppChoiceHandler(handler: ChoiceHandler) {
  activeHandler = handler;
  return () => { if (activeHandler === handler) activeHandler = null; };
}

export function requestAppChoice(options: AppChoiceOptions) {
  return activeHandler ? activeHandler(options) : Promise.resolve(null);
}
