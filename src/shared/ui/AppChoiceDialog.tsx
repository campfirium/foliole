import type { AppChoiceOptions } from './appChoice';
import { AppButton } from './Button';

export function AppChoiceDialog(props: { options: AppChoiceOptions; onChoose(value: string): void }) {
  const buttons = props.options.choices.filter((choice) => choice.tone !== 'danger');
  const links = props.options.choices.filter((choice) => choice.tone === 'danger');
  return (
    <div className="mt-4 flex flex-col gap-2">
      {buttons.map((choice) => (
        <AppButton className="min-h-12 touch-manipulation py-2.5 leading-snug" data-choice-value={choice.value}
          data-testid="app-choice" key={choice.value} size="md"
          variant={choice.tone === 'primary' ? 'emphasis' : 'default'} onClick={() => props.onChoose(choice.value)}>
          {choice.label}
        </AppButton>
      ))}
      {links.map((choice) => (
        <button className="mt-2 min-h-11 touch-manipulation self-center px-2 text-ui-sm text-error underline-offset-2 hover:underline"
          data-choice-value={choice.value} data-testid="app-choice" key={choice.value} type="button"
          onClick={() => props.onChoose(choice.value)}>
          {choice.label}
        </button>
      ))}
    </div>
  );
}
