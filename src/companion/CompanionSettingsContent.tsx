type CompanionSettingsPage = 'list' | 'sync';

function ChevronIcon() {
  return <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>;
}

function BackIcon() {
  return <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /></svg>;
}

function SettingsListItem(props: {
  detail: string;
  onClick(): void;
  title: string;
}) {
  return (
    <button
      className="flex w-full items-center justify-between gap-4 border-b border-companion-divider py-4 text-left transition hover:bg-bg-subtle/45"
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

export function CompanionSettingsList(props: { onOpenSync(): void }) {
  return (
    <section className="px-1 py-4">
      <h1 className="text-2xl font-semibold leading-tight text-foreground">Settings</h1>
      <div className="mt-5">
        <SettingsListItem detail="Pair devices and check sync status." onClick={props.onOpenSync} title="Sync" />
      </div>
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
      <button
        className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-companion-text-secondary transition hover:text-foreground"
        onClick={props.onBack}
        type="button"
      >
        <BackIcon />
        Settings
      </button>
      <h1 className="px-1 text-2xl font-semibold leading-tight text-foreground">{props.title}</h1>
      <div className="mt-3">{props.children}</div>
    </section>
  );
}
