import { useEffect, useState, type ReactNode } from 'react';

import { setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';
import { AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../../shared/ui';
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

  useEffect(() => setWhitelistedLocalStorageItem(SETTINGS_CATEGORY_STORAGE_KEY, activeCategory), [activeCategory]);
  useEffect(() => {
    if (requestedCategory) {
      setActiveCategory(requestedCategory);
    }
  }, [requestedCategory]);
  const title = SETTINGS_CATEGORIES.find((category) => category.id === activeCategory)?.label ?? 'Settings';

  return {
    activeCategory,
    setActiveCategory,
    title,
    ...libraryPathSettings
  };
}

type SettingsPanelBodyProps = {
  activeCategory: SettingsCategoryId;
  assetsPath: string;
  errorByLocation: Record<'assets_dir' | 'inbox' | 'library_home' | 'mirror', string | null>;
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
  importCategoryContent?: ReactNode;
  onClose: () => void;
  onChangeLocation: (location: 'assets_dir' | 'inbox' | 'library_home' | 'mirror') => void;
  onRebuildMirrorLinks: () => void;
  onRebuildMirrorOutput: () => void;
  onRestoreDefault: (location: 'assets_dir' | 'inbox' | 'library_home' | 'mirror') => void;
  pendingLocation: 'assets_dir' | 'inbox' | 'library_home' | 'mirror' | null;
  readwiseReaderCategoryContent?: ReactNode;
  setActiveCategory: (category: SettingsCategoryId) => void;
  title: string;
};

type SettingsPanelCategoryProps = Omit<
  SettingsCategoryContentProps,
  'hotkeyItems' | 'onHotkeyReset' | 'onHotkeyResetAll' | 'onHotkeyUpdate'
>;

function SettingsPanelBody(props: SettingsPanelBodyProps) {
  const hotkeys = useHotkeySettings();
  const categoryProps: SettingsPanelCategoryProps = {
    activeCategory: props.activeCategory,
    assetsPath: props.assetsPath,
    errorByLocation: props.errorByLocation,
    inboxPath: props.inboxPath,
    isDesktopRuntime: props.isDesktopRuntime,
    isRebuildingMirrorLinks: props.isRebuildingMirrorLinks,
    isRebuildingMirrorOutput: props.isRebuildingMirrorOutput,
    libraryHomePath: props.libraryHomePath,
    mirrorLinkRebuildError: props.mirrorLinkRebuildError,
    mirrorLinkRebuildFeedback: props.mirrorLinkRebuildFeedback,
    mirrorOutputRebuildError: props.mirrorOutputRebuildError,
    mirrorOutputRebuildFeedback: props.mirrorOutputRebuildFeedback,
    mirrorPath: props.mirrorPath,
    importCategoryContent: props.importCategoryContent,
    onChangeLocation: props.onChangeLocation,
    onRebuildMirrorLinks: props.onRebuildMirrorLinks,
    onRebuildMirrorOutput: props.onRebuildMirrorOutput,
    onRestoreDefault: props.onRestoreDefault,
    pendingLocation: props.pendingLocation,
    readwiseReaderCategoryContent: props.readwiseReaderCategoryContent
  };

  return (
    <AppDialog modal open onOpenChange={(open) => !open && props.onClose()}>
      <AppDialogPortal>
        <AppDialogOverlay aria-label="Settings" onClick={props.onClose} role="presentation" />
        <AppDialogContent
          aria-label="Settings dialog"
          aria-describedby={undefined}
          className="grid h-[min(800px,calc(100dvh-36px))] w-[min(1180px,calc(100vw-36px))] max-w-none overflow-hidden grid-cols-[260px_minmax(0,1fr)] rounded-lg shadow-panel"
        >
          <SettingsSidebar activeCategory={props.activeCategory} setActiveCategory={props.setActiveCategory} />
          <div className="app-scrollbar overflow-auto bg-background p-4 pb-5">
            <header className="mb-2 min-h-[48px] px-1 py-2">
              <AppDialogTitle className="sr-only">Settings dialog</AppDialogTitle>
              <h2 className="text-[1.16rem] font-semibold text-foreground">{props.title}</h2>
            </header>
            <SettingsCategoryContent {...categoryProps} {...hotkeys} />
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
