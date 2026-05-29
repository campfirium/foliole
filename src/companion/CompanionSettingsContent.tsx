import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';

function ChevronIcon() {
  return <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>;
}

function SettingsListItem(props: {
  detail: string;
  onClick(): void;
  title: string;
}) {
  return (
    <button
      className="flex min-h-16 w-full items-center justify-between gap-4 border-b border-companion-divider py-4 text-left transition hover:bg-companion-subtle/60 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-companion-accent active:bg-companion-subtle/80"
      onClick={props.onClick}
      type="button"
    >
      <span className="min-w-0">
        <span className="block text-base font-medium text-foreground">{props.title}</span>
        <span className="mt-1 block truncate text-sm text-companion-text-secondary">{props.detail}</span>
      </span>
      <span className="shrink-0 text-companion-text-secondary"><ChevronIcon /></span>
    </button>
  );
}

export function CompanionSettingsList(props: {
  onOpenAppearance(): void;
  onOpenDebug(): void;
  onOpenDevice(): void;
  onOpenStorage(): void;
  onOpenSync(): void;
}) {
  return (
    <section className="px-1 pb-4">
      <div>
        <SettingsListItem detail="Connect another device and bring your content here." onClick={props.onOpenSync} title="Sync" />
        <SettingsListItem detail="Device information will appear here." onClick={props.onOpenDevice} title="Device" />
        <SettingsListItem detail="Clear Foliole data on this device." onClick={props.onOpenStorage} title="Storage" />
        <SettingsListItem detail="Display preferences will appear here." onClick={props.onOpenAppearance} title="Appearance" />
        <SettingsListItem detail="Diagnostics and development details will appear here." onClick={props.onOpenDebug} title="Debug" />
      </div>
    </section>
  );
}

export function CompanionPlaceholderSettingsContent(props: {
  detail: string;
  title: string;
}) {
  return (
    <section className="px-1 py-4">
      <h2 className="text-base font-semibold text-foreground">{props.title}</h2>
      <p className="mt-3 text-sm leading-6 text-companion-text-secondary">{props.detail}</p>
    </section>
  );
}

export function CompanionSettingsDetail(props: {
  children: React.ReactNode;
  onBack(): void;
  page: CompanionSettingsPage;
  title: string;
}) {
  return (
    <section className="py-4">
      {props.children}
    </section>
  );
}
