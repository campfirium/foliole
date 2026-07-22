import { useId, type ReactNode } from 'react';

import {
  SettingsControlSlot,
  SettingsRow,
  settingsFieldClassName
} from '../../../../shared/ui';

export function PublishingTextRow(props: {
  description: ReactNode;
  disabled: boolean;
  error?: string | undefined;
  label: string;
  onBlur?: () => void;
  onChange: (value: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  title: string;
  type?: 'password' | 'text';
  value: string;
}) {
  const errorId = useId();
  return (
    <SettingsRow description={props.description} title={props.title}>
      <SettingsControlSlot className="w-[min(360px,100%)]">
        <div className="min-w-0 flex-1">
          <input
            aria-describedby={props.error ? errorId : undefined}
            aria-invalid={props.error ? true : undefined}
            aria-label={props.label}
            className={settingsFieldClassName()}
            disabled={props.disabled}
            onBlur={props.onBlur}
            onChange={(event) => props.onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') props.onEnter?.();
            }}
            placeholder={props.placeholder}
            type={props.type ?? 'text'}
            value={props.value}
          />
          {props.error ? <p className="mt-1 text-sm leading-5 text-error" id={errorId} role="alert">{props.error}</p> : null}
        </div>
      </SettingsControlSlot>
    </SettingsRow>
  );
}
