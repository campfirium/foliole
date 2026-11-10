import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { CompanionBottomSheet } from './CompanionBottomSheet';

export function CompanionReminderChoice<Value extends string>(props: {
  label: string;
  value: Value;
  options: Readonly<Record<Value, string>>;
  disabled: boolean;
  onChange(value: Value): void;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" aria-haspopup="dialog" aria-label={`${props.label} ${props.options[props.value]}`}
      disabled={props.disabled}
      className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-sm"
      onClick={() => setOpen(true)}>
      <span>{props.label}</span>
      <span className="flex items-center gap-2 text-companion-text-secondary">
        {props.options[props.value]}<ChevronRight size={16} aria-hidden="true" />
      </span>
    </button>
    <CompanionBottomSheet open={open} onOpenChange={setOpen} title={props.label}>
      {(Object.keys(props.options) as Value[]).map(value => (
        <button type="button" key={value} aria-current={value === props.value ? 'true' : undefined}
          className="block min-h-11 w-full border-b border-companion-divider text-left last:border-0"
          onClick={() => { props.onChange(value); setOpen(false); }}>
          {props.options[value]}
        </button>
      ))}
    </CompanionBottomSheet>
  </>;
}
