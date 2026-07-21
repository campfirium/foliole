import type { ReactNode } from 'react';

import {
  SettingsControlSlot,
  SettingsRow,
  settingsFieldClassName
} from '../../../../shared/ui';

export function PublishingTextRow(props: {
  description: ReactNode;
  disabled: boolean;
  label: string;
  onBlur?: () => void;
  onChange: (value: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  title: string;
  type?: 'password' | 'text';
  value: string;
}) {
  return (
    <SettingsRow description={props.description} title={props.title}>
      <SettingsControlSlot className="w-[min(360px,100%)]">
        <input
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
      </SettingsControlSlot>
    </SettingsRow>
  );
}
