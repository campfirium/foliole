import { useState, type ButtonHTMLAttributes } from 'react';

import type { AppChoiceOptions } from './appChoice';
import { AppButton } from './Button';

import { cn } from '@/shared/lib/utils';

export function AppChoiceDialog(props: { options: AppChoiceOptions; onChoose(value: string): void }) {
  const [expanded, setExpanded] = useState(false);
  const buttons = props.options.choices.filter((choice) => choice.tone !== 'danger');
  const links = props.options.choices.filter((choice) => choice.tone === 'danger');
  const folded = Boolean(props.options.moreLabel) && links.length > 0 && !expanded;
  return (
    <div className="mt-4 flex flex-col gap-2">
      {buttons.map((choice) => (
        <AppButton className="min-h-12 touch-manipulation py-2.5 leading-snug" data-choice-value={choice.value}
          data-testid="app-choice" key={choice.value} size="md"
          variant={choice.tone === 'primary' ? 'emphasis' : 'default'} onClick={() => props.onChoose(choice.value)}>
          {choice.label}
        </AppButton>
      ))}
      {folded ? (
        <ChoiceLink className="text-foreground/56" aria-expanded={false} onClick={() => setExpanded(true)}>
          {props.options.moreLabel}
        </ChoiceLink>
      ) : links.map((choice) => (
        <ChoiceLink className="text-error" data-choice-value={choice.value} data-testid="app-choice" key={choice.value}
          onClick={() => props.onChoose(choice.value)}>
          {choice.label}
        </ChoiceLink>
      ))}
    </div>
  );
}

function ChoiceLink({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={cn('mt-2 min-h-11 touch-manipulation self-center px-2 text-ui-sm underline-offset-2 hover:underline', className)}
      type="button" {...props} />
  );
}
