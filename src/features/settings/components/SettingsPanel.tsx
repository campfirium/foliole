import { useEffect, useState, type ReactNode } from 'react';

import { setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';
import { AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../../shared/ui';
import { useAppearanceSettings } from '../context/AppearanceSettingsProvider';
import { useHotkeySettings } from '../context/HotkeySettingsProvider';
import {
  getInitialSettingsCategory,
  SETTINGS_CATEGORIES,
  SETTINGS_CATEGORY_STORAGE_KEY,
  type SettingsCategoryId
} from '../model/settingsPanelOptions';

import {
  SettingsCategoryContent,
  SettingsSidebar,
  type SettingsCategoryContentProps
} from './SettingsPanelSections';
import { useExternalSearchFolders } from './useExternalSearchFolders';
import { useLibraryPathSettings } from './useLibraryPathSettings';

interface SettingsPanelProps {
  importCategoryContent?: ReactNode;
  onClose: () => void;
  readwiseReaderCategoryContent?: ReactNode;
  requestedCategory?: SettingsCategoryId | null;
}

export function SettingsPanel(props: SettingsPanelProps) {
  return <SettingsPanelContent {...props} />;
}

function SettingsPanelContent(props: SettingsPanelProps) {
  const state = useSettingsPanelViewState(props.requestedCategory ?? null);
  return <SettingsPanelBody {...props} {...state} />;
}

function useSettingsPanelViewState(requestedCategory: SettingsCategoryId | null) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>(() => requestedCategory ?? getInitialSettingsCategory());
  const libraryPathSettings = useLibraryPathSettings();
  const externalSearchFolders = useExternalSearchFolders();

  useEffect(() => setWhitelistedLocalStorageItem(SETTINGS_CATEGORY_STORAGE_KEY, activeCategory), [activeCategory]);
  useEffect(() => {
    if (requestedCategory) {
      setActiveCategory(requestedCategory);
    }
  }, [requestedCategory]);
  const title = SETTINGS_CATEGORIES.find((category) => category.id === activeCategory)?.label ?? 'Settings';
  const description =
    SETTINGS_CATEGORIES.find((category) => category.id === activeCategory)?.description ??
    'Adjust how Foliole looks and behaves.';

  return {
    activeCategory,
    description,
    setActiveCategory,
    title,
    ...externalSearchFolders,
    ...libraryPathSettings
  };
}

type SettingsPanelBodyProps = {
  activeCategory: SettingsCategoryId;
  assetsPath: string;
  errorByLocation: Record<'assets_dir' | 'inbox' | 'library_home' | 'mirror', string | null>;
  externalSearchError: string | null;
  externalSearchFeedback: string | null;
  externalSearchFolders: ReturnType<typeof useExternalSearchFolders>['externalSearchFolders'];
  inboxPath: string;
  isDesktopRuntime: boolean;
  isRebuildingMirrorLinks: boolean;
  isRebuildingMirrorOutput: boolean;
  isSavingExternalSearchFolders: boolean;
  libraryHomePath: string;
  description: string;
  mirrorLinkRebuildError: string | null;
  mirrorLinkRebuildFeedback: string | null;
  mirrorOutputRebuildError: string | null;
  mirrorOutputRebuildFeedback: string | null;
  mirrorPath: string;
  importCategoryContent?: ReactNode;
  onClose: () => void;
  onChangeLocation: (location: 'assets_dir' | 'inbox' | 'library_home' | 'mirror') => void;
  onAddExternalSearchFolder: () => void;
  onChooseExternalAttachmentRoot: (folderId: string) => void;
  onChooseExternalSearchFolder: (folderId: string) => void;
  onRebuildExternalSearchIndex: (folderId?: string) => void;
  onRemoveExternalSearchFolder: (folderId: string) => void;
  onRebuildMirrorLinks: () => void;
  onRebuildMirrorOutput: () => void;
  onRestoreDefault: (location: 'assets_dir' | 'inbox' | 'library_home' | 'mirror') => void;
  onUpdateExternalSearchFolder: ReturnType<typeof useExternalSearchFolders>['onUpdateExternalSearchFolder'];
  pendingLocation: 'assets_dir' | 'inbox' | 'library_home' | 'mirror' | null;
  readwiseReaderCategoryContent?: ReactNode;
  setActiveCategory: (category: SettingsCategoryId) => void;
  title: string;
};

type SettingsPanelCategoryProps = Omit<
  SettingsCategoryContentProps,
  'hotkeyItems' | 'onHotkeyReset' | 'onHotkeyResetAll' | 'onHotkeyUpdate'
>;

function useSettingsPreviewMode() {
  const [isPreviewActive, setIsPreviewActive] = useState(false);

  useEffect(() => {
    if (!isPreviewActive) {
      return undefined;
    }
    const stopPreview = () => setIsPreviewActive(false);
    window.addEventListener('keydown', stopPreview, { once: true });
    window.addEventListener('pointerdown', stopPreview, { once: true });
    return () => {
      window.removeEventListener('keydown', stopPreview);
      window.removeEventListener('pointerdown', stopPreview);
    };
  }, [isPreviewActive]);

  return { isPreviewActive, setIsPreviewActive };
}

function createSettingsCategoryProps(
  props: SettingsPanelBodyProps,
  setIsPreviewActive: (value: boolean) => void
): SettingsPanelCategoryProps {
  return {
    activeCategory: props.activeCategory,
    assetsPath: props.assetsPath,
    errorByLocation: props.errorByLocation,
    externalSearchError: props.externalSearchError,
    externalSearchFeedback: props.externalSearchFeedback,
    externalSearchFolders: props.externalSearchFolders,
    inboxPath: props.inboxPath,
    isDesktopRuntime: props.isDesktopRuntime,
    isRebuildingMirrorLinks: props.isRebuildingMirrorLinks,
    isRebuildingMirrorOutput: props.isRebuildingMirrorOutput,
    isSavingExternalSearchFolders: props.isSavingExternalSearchFolders,
    libraryHomePath: props.libraryHomePath,
    mirrorLinkRebuildError: props.mirrorLinkRebuildError,
    mirrorLinkRebuildFeedback: props.mirrorLinkRebuildFeedback,
    mirrorOutputRebuildError: props.mirrorOutputRebuildError,
    mirrorOutputRebuildFeedback: props.mirrorOutputRebuildFeedback,
    mirrorPath: props.mirrorPath,
    importCategoryContent: props.importCategoryContent,
    onChangeLocation: props.onChangeLocation,
    onAddExternalSearchFolder: props.onAddExternalSearchFolder,
    onChooseExternalAttachmentRoot: props.onChooseExternalAttachmentRoot,
    onChooseExternalSearchFolder: props.onChooseExternalSearchFolder,
    onRebuildExternalSearchIndex: props.onRebuildExternalSearchIndex,
    onRemoveExternalSearchFolder: props.onRemoveExternalSearchFolder,
    onRebuildMirrorLinks: props.onRebuildMirrorLinks,
    onRebuildMirrorOutput: props.onRebuildMirrorOutput,
    onRestoreDefault: props.onRestoreDefault,
    onUpdateExternalSearchFolder: props.onUpdateExternalSearchFolder,
    pendingLocation: props.pendingLocation,
    readwiseReaderCategoryContent: props.readwiseReaderCategoryContent,
    onEnterPreview: () => setIsPreviewActive(true)
  };
}

function AppearanceHeaderModeControl() {
  const appearance = useAppearanceSettings();

  return (
    <div className="w-full max-w-[720px] rounded-2xl border border-settings-outline bg-settings-group px-5 py-5 shadow-settings">
      <select
        aria-label="Mode"
        className="w-full rounded-xl border border-settings-divider bg-settings-shell px-5 py-4 text-[1.05rem] text-foreground outline-none transition-colors focus:border-foreground/35"
        onChange={(event) => appearance.setBaseColorMode(event.target.value as typeof appearance.baseColorMode)}
        value={appearance.baseColorMode}
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">Follow system</option>
      </select>
    </div>
  );
}

function SettingsPanelDialog(props: {
  categoryProps: SettingsPanelCategoryProps;
  hotkeys: ReturnType<typeof useHotkeySettings>;
  isPreviewActive: boolean;
  onClose: () => void;
  title: string;
  description: string;
  activeCategory: SettingsCategoryId;
  setActiveCategory: (category: SettingsCategoryId) => void;
}) {
  return (
    <AppDialog modal open onOpenChange={(open) => !open && props.onClose()}>
      <AppDialogPortal>
        <AppDialogOverlay aria-label="Settings" className={props.isPreviewActive ? 'bg-transparent' : undefined} onClick={props.isPreviewActive ? undefined : props.onClose} role="presentation" />
        {props.isPreviewActive ? <div className="fixed inset-0 z-[80]" /> : null}
        <AppDialogContent aria-label="Settings dialog" aria-describedby={undefined} className={`grid h-[min(800px,calc(100dvh-36px))] w-[min(1240px,calc(100vw-36px))] max-w-none grid-cols-[300px_minmax(0,1fr)] overflow-hidden rounded-2xl border-settings-outline bg-settings-shell shadow-settings ${props.isPreviewActive ? 'pointer-events-none opacity-0' : ''}`}>
          <SettingsSidebar activeCategory={props.activeCategory} setActiveCategory={props.setActiveCategory} />
          <div className="app-scrollbar overflow-auto bg-settings-shell px-7 pb-7 pt-6">
            <header className="mb-3 grid min-h-[48px] gap-5 border-b border-settings-divider px-1 pb-5 md:grid-cols-[minmax(0,1fr)_minmax(320px,720px)] md:items-end">
              <AppDialogTitle className="sr-only">Settings dialog</AppDialogTitle>
              <div className="min-w-0">
                <h2 className="text-[1.16rem] font-semibold text-foreground">{props.title}</h2>
                <p className="mt-2 max-w-[720px] text-[0.96rem] text-foreground/62">{props.description}</p>
              </div>
              {props.activeCategory === 'appearance' ? <AppearanceHeaderModeControl /> : null}
            </header>
            <SettingsCategoryContent {...props.categoryProps} {...props.hotkeys} />
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}

function SettingsPanelBody(props: SettingsPanelBodyProps) {
  const hotkeys = useHotkeySettings();
  const preview = useSettingsPreviewMode();
  const categoryProps = createSettingsCategoryProps(props, preview.setIsPreviewActive);

  return (
    <SettingsPanelDialog
      activeCategory={props.activeCategory}
      categoryProps={categoryProps}
      description={props.description}
      hotkeys={hotkeys}
      isPreviewActive={preview.isPreviewActive}
      onClose={props.onClose}
      setActiveCategory={props.setActiveCategory}
      title={props.title}
    />
  );
}
