import type { CompanionHandoffReminderSettings, HandoffReminderDelay } from './companionHandoffReminderSettings';

const SHORT_DELAY_OPTIONS: Array<{ label: string; value: HandoffReminderDelay }> = [
  { label: 'Off', value: 'off' },
  { label: '2 minutes', value: '2' },
  { label: '5 minutes', value: '5' },
  { label: '15 minutes', value: '15' },
  { label: '30 minutes', value: '30' },
  { label: '1 hour', value: '60' },
  { label: '3 hours', value: '180' }
];

function SettingsSelect(props: {
  label: string;
  onChange(value: string): void;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block border-b border-companion-divider py-4 last:border-b-0">
      <span className="block text-sm font-medium text-foreground">{props.label}</span>
      <select
        className="mt-2 w-full rounded-2xl border border-border bg-canvas px-3 py-3 text-sm text-foreground"
        onChange={(event) => props.onChange(event.target.value)}
        value={props.value}
      >
        {props.children}
      </select>
    </label>
  );
}

export function CompanionHandoffReminderSettingsPanel(props: {
  settings: CompanionHandoffReminderSettings;
  onChange(settings: CompanionHandoffReminderSettings): void;
}) {
  return (
    <section className="rounded-3xl border border-border bg-canvas px-5 py-5 text-foreground">
      <h3 className="text-lg font-semibold leading-tight">Handoff reminders</h3>
      <p className="mt-3 text-sm leading-6 text-accent">
        Reminders only appear when this device has local changes that have not been handed off.
      </p>
      <div className="mt-3">
        <SettingsSelect
          label="Short reminder"
          onChange={(shortDelay) => props.onChange({ ...props.settings, shortDelay: shortDelay as HandoffReminderDelay })}
          value={props.settings.shortDelay}
        >
          {SHORT_DELAY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </SettingsSelect>
        <SettingsSelect
          label="Daily reminder"
          onChange={(fixedTime) => props.onChange({ ...props.settings, fixedTime: fixedTime || null })}
          value={props.settings.fixedTime ?? ''}
        >
          <option value="">Off</option>
          <option value="18:00">18:00</option>
          <option value="21:00">21:00</option>
          <option value="22:30">22:30</option>
        </SettingsSelect>
      </div>
    </section>
  );
}
