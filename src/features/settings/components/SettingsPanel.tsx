import { useEffect, useState } from 'react';

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
import { useManagedInboxSettings } from './useManagedInboxSettings';

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel(props: SettingsPanelProps) {
  return <SettingsPanelContent {...props} />;
}

function SettingsPanelContent(props: SettingsPanelProps) {
  const state = useSettingsPanelViewState();
  return <SettingsPanelBody {...props} {...state} />;
}

function useSettingsPanelViewState() {
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>(() => getInitialSettingsCategory());
  const managedInboxSettings = useManagedInboxSettings();

  useEffect(() => setWhitelistedLocalStorageItem(SETTINGS_CATEGORY_STORAGE_KEY, activeCategory), [activeCategory]);
  const title = SETTINGS_CATEGORIES.find((category) => category.id === activeCategory)?.label ?? 'Settings';

  return {
    activeCategory,
    setActiveCategory,
    title,
    ...managedInboxSettings
  };
}

type SettingsPanelBodyProps = {
  activeCategory: SettingsCategoryId;
  inboxPath: string;
  inboxPathError: string | null;
  isInboxDesktopRuntime: boolean;
  isInboxPathPending: boolean;
  onClose: () => void;
  onInboxPathChangeRequest: () => void;
  onInboxPathRestoreDefault: () => void;
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
    inboxPath: props.inboxPath,
    inboxPathError: props.inboxPathError,
    isInboxDesktopRuntime: props.isInboxDesktopRuntime,
    isInboxPathPending: props.isInboxPathPending,
    onInboxPathChangeRequest: props.onInboxPathChangeRequest,
    onInboxPathRestoreDefault: props.onInboxPathRestoreDefault
  };

  return (
    <AppDialog modal open onOpenChange={(open) => !open && props.onClose()}>
      <AppDialogPortal>
        <AppDialogOverlay aria-label="Settings" onClick={props.onClose} role="presentation" />
        <AppDialogContent
          aria-label="Settings dialog"
          aria-describedby={undefined}
          className="grid h-[min(800px,calc(100dvh-36px))] w-[min(1180px,calc(100vw-36px))] max-w-none overflow-hidden grid-cols-[260px_minmax(0,1fr)]"
        >
          <SettingsSidebar activeCategory={props.activeCategory} setActiveCategory={props.setActiveCategory} />
          <div className="app-scrollbar overflow-auto p-4 pb-5">
            <header className="mb-2">
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
