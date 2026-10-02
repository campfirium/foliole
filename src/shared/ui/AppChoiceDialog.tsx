import type { AppChoiceOptions } from './appChoice';
import { AppButton } from './Button';

export function AppChoiceDialog(props: { options: AppChoiceOptions; onChoose(value: string): void }) {
  return (
    <div className="mt-4 flex flex-col gap-2">
      {props.options.choices.map((choice) => (
        <AppButton key={choice.value} variant="default" onClick={() => props.onChoose(choice.value)}>
          {choice.label}
        </AppButton>
      ))}
    </div>
  );
}
