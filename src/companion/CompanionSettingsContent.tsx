type CompanionSettingsPage = 'list' | 'sync';

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
      <div>
        <SettingsListItem detail="Connect another device and bring your content here." onClick={props.onOpenSync} title="Device sync" />
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
      {props.children}
    </section>
  );
}
