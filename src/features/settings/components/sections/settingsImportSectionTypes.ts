export type LibraryPathLocation = 'assets_dir' | 'inbox' | 'library_home' | 'mirror';

export type SettingsImportSectionProps = {
  assetsPath: string;
  errorByLocation: Record<LibraryPathLocation, string | null>;
  inboxPath: string;
  isDesktopRuntime: boolean;
  isRebuildingMirrorLinks: boolean;
  isRebuildingMirrorOutput: boolean;
  libraryHomePath: string;
  mirrorLinkRebuildError: string | null;
  mirrorLinkRebuildFeedback: string | null;
  mirrorOutputRebuildError: string | null;
  mirrorOutputRebuildFeedback: string | null;
  mirrorPath: string;
  onChangeLocation: (location: LibraryPathLocation) => void;
  onRebuildMirrorLinks: () => void;
  onRebuildMirrorOutput: () => void;
  onRestoreDefault: (location: LibraryPathLocation) => void;
  pendingLocation: LibraryPathLocation | null;
};
