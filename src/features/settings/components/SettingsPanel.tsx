import { useEffect, useState, type ReactNode } from 'react';

import { setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';
import { AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../../shared/ui';
import { useHotkeySettings } from '../context/HotkeySettingsProvider';
import {
  getSettingsCategoryOption,
  getInitialSettingsCategory,
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
  const category = getSettingsCategoryOption(activeCategory);
  const title = category?.label ?? 'Settings';
  const description = category?.description ?? 'Adjust how Foliole looks and behaves.';

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
  isLoadingLibraryPaths: boolean;
  isRebuildingMirrorLinks: boolean;
  isRebuildingMirrorOutput: boolean;
  isLoadingExternalSearchFolders: boolean;
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
  onRetryLoadExternalSearchFolders: () => void;
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
    isLoadingLibraryPaths: props.isLoadingLibraryPaths,
    isRebuildingMirrorLinks: props.isRebuildingMirrorLinks,
    isRebuildingMirrorOutput: props.isRebuildingMirrorOutput,
    isLoadingExternalSearchFolders: props.isLoadingExternalSearchFolders,
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
    onRetryLoadExternalSearchFolders: props.onRetryLoadExternalSearchFolders,
    onRebuildMirrorLinks: props.onRebuildMirrorLinks,
    onRebuildMirrorOutput: props.onRebuildMirrorOutput,
    onRestoreDefault: props.onRestoreDefault,
    onUpdateExternalSearchFolder: props.onUpdateExternalSearchFolder,
    pendingLocation: props.pendingLocation,
    readwiseReaderCategoryContent: props.readwiseReaderCategoryContent,
    onEnterPreview: () => setIsPreviewActive(true)
  };
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
        <AppDialogContent aria-label="Settings dialog" aria-describedby={undefined} className={`grid h-[min(800px,calc(100dvh-36px))] w-[min(1240px,calc(100vw-36px))] max-w-none grid-cols-[300px_minmax(0,1fr)] overflow-hidden rounded-lg border-settings-outline bg-settings-shell shadow-settings ${props.isPreviewActive ? 'pointer-events-none opacity-0' : ''}`}>
          <SettingsSidebar activeCategory={props.activeCategory} setActiveCategory={props.setActiveCategory} />
          <div className="app-scrollbar overflow-auto bg-settings-shell px-7 py-7">
            <AppDialogTitle className="sr-only">Settings dialog</AppDialogTitle>
            <h2 className="sr-only">{props.title}</h2>
            <p className="sr-only">{props.description}</p>
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
