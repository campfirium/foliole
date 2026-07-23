import { useId, type ReactNode } from 'react';

import { settingsFieldClassName } from '../../../../shared/ui';

import { PublishingSetupStep } from './PublishingSetupStep';

export function PublishingTextRow(props: {
  description: ReactNode;
  disabled: boolean;
  error?: string | undefined;
  label: string;
  name?: string;
  onBlur?: () => void;
  onChange: (value: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  title: string;
  type?: 'password' | 'text' | 'url';
  value: string;
}) {
  const errorId = useId();
  return (
    <PublishingSetupStep description={props.description} title={props.title}>
      <div className="min-w-0 flex-1">
          <input
            aria-describedby={props.error ? errorId : undefined}
            aria-invalid={props.error ? true : undefined}
            aria-label={props.label}
            autoComplete="off"
            className={settingsFieldClassName()}
            disabled={props.disabled}
            name={props.name}
            onBlur={props.onBlur}
            onChange={(event) => props.onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') props.onEnter?.();
            }}
            placeholder={props.placeholder}
            spellCheck={false}
            type={props.type ?? 'text'}
            value={props.value}
          />
          {props.error ? <p className="mt-1 text-sm leading-5 text-error" id={errorId} role="alert">{props.error}</p> : null}
      </div>
    </PublishingSetupStep>
  );
}
