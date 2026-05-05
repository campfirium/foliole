import { SettingsControlSlot, SettingsRow, SettingsSection } from '../../../../shared/ui';

type LibraryPathLocation = 'inbox' | 'library_home' | 'mirror';

function LibraryLocationRow(props: {
  description: string;
  errorMessage: string | null;
  isDesktopRuntime: boolean;
  isPending: boolean;
  onChangeLocation: (location: LibraryPathLocation) => void;
  onRestoreDefault: (location: LibraryPathLocation) => void;
  path: string;
  title: string;
  location: LibraryPathLocation;
}) {
  return (
    <SettingsRow description={props.description} title={props.title}>
      <SettingsControlSlot className="flex-col items-stretch gap-2">
        <div className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-foreground/75">
          <span className="break-all">{props.path}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-md border border-border bg-bg-panel px-3 py-1.5 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!props.isDesktopRuntime || props.isPending}
            onClick={() => props.onChangeLocation(props.location)}
            type="button"
          >
            Change location
          </button>
          <button
            className="rounded-md border border-border bg-bg-panel px-3 py-1.5 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!props.isDesktopRuntime || props.isPending}
            onClick={() => props.onRestoreDefault(props.location)}
            type="button"
          >
            Restore default
          </button>
        </div>
        {props.errorMessage ? <p className="text-sm text-red-700">{props.errorMessage}</p> : null}
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function SettingsImportSection(props: {
  errorByLocation: Record<LibraryPathLocation, string | null>;
  inboxPath: string;
  isDesktopRuntime: boolean;
  libraryHomePath: string;
  mirrorPath: string;
  onChangeLocation: (location: LibraryPathLocation) => void;
  onRestoreDefault: (location: LibraryPathLocation) => void;
  pendingLocation: LibraryPathLocation | null;
}) {
  return (
    <SettingsSection
      ariaLabel="Library settings section"
      description="Library Home is the main root for your library. Inbox is the drop folder, and Mirror is a read-only copy that can be rebuilt."
      title="Library paths"
    >
      <LibraryLocationRow
        description="Main library root for your long-term data. Database, Data, and Assets stay inside Library Home and are not configured separately."
        errorMessage={props.errorByLocation.library_home}
        isDesktopRuntime={props.isDesktopRuntime}
        isPending={props.pendingLocation === 'library_home'}
        location="library_home"
        onChangeLocation={props.onChangeLocation}
        onRestoreDefault={props.onRestoreDefault}
        path={props.libraryHomePath}
        title="Library Home"
      />
      <LibraryLocationRow
        description="Drop folder for incoming files. Foliole absorbs files quickly, so it should stay close to empty instead of becoming a long-term content folder."
        errorMessage={props.errorByLocation.inbox}
        isDesktopRuntime={props.isDesktopRuntime}
        isPending={props.pendingLocation === 'inbox'}
        location="inbox"
        onChangeLocation={props.onChangeLocation}
        onRestoreDefault={props.onRestoreDefault}
        path={props.inboxPath}
        title="Inbox"
      />
      {!props.isDesktopRuntime ? (
        <p className="text-sm text-foreground/60">Library folder settings are available in the desktop app.</p>
      ) : null}
      <LibraryLocationRow
        description="Read-only Markdown mirror generated from library data. It is not the source of truth and can be rebuilt at any time."
        errorMessage={props.errorByLocation.mirror}
        isDesktopRuntime={props.isDesktopRuntime}
        isPending={props.pendingLocation === 'mirror'}
        location="mirror"
        onChangeLocation={props.onChangeLocation}
        onRestoreDefault={props.onRestoreDefault}
        path={props.mirrorPath}
        title="Mirror"
      />
    </SettingsSection>
  );
}
