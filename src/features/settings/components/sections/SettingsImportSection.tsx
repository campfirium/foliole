import { SettingsControlSlot, SettingsRow, SettingsSection } from '../../../../shared/ui';

function PlannedLibraryLocationRow(props: { description: string; note: string; title: string }) {
  return (
    <SettingsRow description={props.description} readonly title={props.title}>
      <SettingsControlSlot className="flex-col items-stretch gap-2">
        <div className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-foreground/75">
          {props.note}
        </div>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-[0.82rem] text-foreground/70">Planned</span>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function SettingsImportSection(props: {
  errorMessage: string | null;
  inboxPath: string;
  isDesktopRuntime: boolean;
  isPending: boolean;
  onChangeLocation: () => void;
  onRestoreDefault: () => void;
}) {
  return (
    <SettingsSection
      ariaLabel="Library settings section"
      description="Library Home is the main root for your library. Inbox is the drop folder, and Mirror is a read-only copy that can be rebuilt."
      title="Library paths"
    >
      <PlannedLibraryLocationRow
        description="Main library root for your long-term data. Database, Data, and Assets stay inside Library Home and are not configured separately."
        note="Library Home path controls land in a follow-up task."
        title="Library Home"
      />
      <SettingsRow
        description="Drop folder for incoming files. Foliole absorbs files quickly, so it should stay close to empty instead of becoming a long-term content folder."
        title="Inbox"
      >
        <SettingsControlSlot className="flex-col items-stretch gap-2">
          <div className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-foreground">
            <span className="break-all">{props.inboxPath}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-md border border-border bg-bg-panel px-3 py-1.5 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!props.isDesktopRuntime || props.isPending}
              onClick={props.onChangeLocation}
              type="button"
            >
              Change location
            </button>
            <button
              className="rounded-md border border-border bg-bg-panel px-3 py-1.5 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!props.isDesktopRuntime || props.isPending}
              onClick={props.onRestoreDefault}
              type="button"
            >
              Restore default
            </button>
          </div>
          {props.errorMessage ? <p className="text-sm text-red-700">{props.errorMessage}</p> : null}
          {!props.isDesktopRuntime ? (
            <p className="text-sm text-foreground/60">Inbox folder settings are available in the desktop app.</p>
          ) : null}
        </SettingsControlSlot>
      </SettingsRow>
      <PlannedLibraryLocationRow
        description="Read-only Markdown mirror generated from library data. It is not the source of truth and can be rebuilt at any time."
        note="Mirror path controls land in a follow-up task."
        title="Mirror"
      />
    </SettingsSection>
  );
}
