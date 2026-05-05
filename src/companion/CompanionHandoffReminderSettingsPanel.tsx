import type { CompanionHandoffReminderSettings, HandoffReminderDelay } from './companionHandoffReminderSettings';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';

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

function HandoffReminderSwitch(props: {
  isEnabled: boolean;
  onToggle(): void;
}) {
  return (
    <button
      aria-label="Handoff reminders"
      aria-checked={props.isEnabled}
      className={`flex h-7 w-12 shrink-0 items-center rounded-full px-1 transition ${props.isEnabled ? 'justify-end bg-companion-accent' : 'justify-start bg-companion-divider-strong'}`}
      onClick={props.onToggle}
      role="switch"
      type="button"
    >
      <span className="h-5 w-5 rounded-full bg-canvas shadow-sm" />
    </button>
  );
}

function ChevronIcon() {
  return <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>;
}

function HandoffReminderSummary(props: {
  isEnabled: boolean;
  onOpen(): void;
}) {
  return (
    <section className="border-t border-companion-divider text-foreground">
      <button
        className="flex w-full items-center justify-between gap-4 border-b border-companion-divider py-4 text-left"
        onClick={props.onOpen}
        type="button"
      >
        <span>
          <span className="block text-sm font-medium text-foreground">Handoff reminders</span>
          <span className="mt-1 block text-xs leading-5 text-companion-text-secondary">
            Remind me when local changes are waiting.
          </span>
        </span>
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          <span>{props.isEnabled ? 'On' : 'Off'}</span>
          <span className="text-companion-text-secondary"><ChevronIcon /></span>
        </span>
      </button>
    </section>
  );
}

function HandoffReminderDetail(props: {
  isEnabled: boolean;
  onChange(settings: CompanionHandoffReminderSettings): void;
  settings: CompanionHandoffReminderSettings;
  toggleEnabled(enabled: boolean): void;
}) {
  return (
    <section className="border-t border-companion-divider text-foreground">
      <div className="flex items-center justify-between gap-4 border-b border-companion-divider py-4">
        <span>
          <span className="block text-sm font-medium text-foreground">Enable reminders</span>
          <span className="mt-1 block text-xs leading-5 text-companion-text-secondary">
            Remind me when local changes are waiting.
          </span>
        </span>
        <HandoffReminderSwitch isEnabled={props.isEnabled} onToggle={() => props.toggleEnabled(!props.isEnabled)} />
      </div>
      <div className="border-b border-companion-divider py-4">
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

export function CompanionHandoffReminderSettingsPanel(props: {
  page: CompanionSettingsPage;
  settings: CompanionHandoffReminderSettings;
  onChange(settings: CompanionHandoffReminderSettings): void;
  onOpenPage(page: CompanionSettingsPage): void;
}) {
  const isEnabled = props.settings.shortDelay !== 'off' || Boolean(props.settings.fixedTime);
  function toggleEnabled(enabled: boolean) {
    props.onChange(enabled
      ? { ...props.settings, shortDelay: props.settings.shortDelay === 'off' ? '15' : props.settings.shortDelay }
      : { fixedTime: null, shortDelay: 'off' });
  }

  if (props.page !== 'syncHandoff') {
    return <HandoffReminderSummary isEnabled={isEnabled} onOpen={() => props.onOpenPage('syncHandoff')} />;
  }

  return (
    <HandoffReminderDetail
      isEnabled={isEnabled}
      settings={props.settings}
      toggleEnabled={toggleEnabled}
      onChange={props.onChange}
    />
  );
}
