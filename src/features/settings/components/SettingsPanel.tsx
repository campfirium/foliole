import { useEffect, useState } from 'react';

import { setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';
import { AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../../shared/ui';
import type { HotkeySettingItem, HotkeyUpdateResult } from '../model/hotkeySettings';
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
  desiredRetention: number;
  maximumIntervalDays: number;
  enableFuzz: boolean;
  enableShortTerm: boolean;
  defaultPriority: number;
  priorityRatio: number;
  queueMixRatioReading: number;
  queueMixRatioFsrs: number;
  readingInitialIntervalMs: number;
  readingIntervalGrowthFactorMin: number;
  readingIntervalGrowthFactorMax: number;
  hotkeyItems: HotkeySettingItem[];
  onClose: () => void;
  onDesiredRetentionChange: (value: number) => void;
  onDefaultPriorityChange: (value: number) => void;
  onMaximumIntervalDaysChange: (value: number) => void;
  onEnableFuzzChange: (value: boolean) => void;
  onEnableShortTermChange: (value: boolean) => void;
  onPriorityRatioChange: (value: number) => void;
  onQueueMixRatioReadingChange: (value: number) => void;
  onQueueMixRatioFsrsChange: (value: number) => void;
  onReadingInitialIntervalDaysChange: (value: number) => void;
  onReadingIntervalGrowthFactorMinChange: (value: number) => void;
  onReadingIntervalGrowthFactorMaxChange: (value: number) => void;
  onHotkeyUpdate: (commandId: string, slot: 'primary' | 'secondary', nextLabel: string) => HotkeyUpdateResult;
  onHotkeyReset: (commandId: string) => void;
  onHotkeyResetAll: () => void;
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

type SettingsPanelBodyProps = SettingsCategoryContentProps & {
  activeCategory: SettingsCategoryId;
  hotkeyItems: HotkeySettingItem[];
  desiredRetention: number;
  maximumIntervalDays: number;
  enableFuzz: boolean;
  enableShortTerm: boolean;
  defaultPriority: number;
  priorityRatio: number;
  queueMixRatioReading: number;
  queueMixRatioFsrs: number;
  readingInitialIntervalMs: number;
  readingIntervalGrowthFactorMin: number;
  readingIntervalGrowthFactorMax: number;
  onClose: () => void;
  onHotkeyReset: (commandId: string) => void;
  onHotkeyResetAll: () => void;
  onHotkeyUpdate: (commandId: string, slot: 'primary' | 'secondary', nextLabel: string) => HotkeyUpdateResult;
  onDesiredRetentionChange: (value: number) => void;
  onDefaultPriorityChange: (value: number) => void;
  onMaximumIntervalDaysChange: (value: number) => void;
  onEnableFuzzChange: (value: boolean) => void;
  onEnableShortTermChange: (value: boolean) => void;
  onPriorityRatioChange: (value: number) => void;
  onQueueMixRatioReadingChange: (value: number) => void;
  onQueueMixRatioFsrsChange: (value: number) => void;
  onReadingInitialIntervalDaysChange: (value: number) => void;
  onReadingIntervalGrowthFactorMinChange: (value: number) => void;
  onReadingIntervalGrowthFactorMaxChange: (value: number) => void;
  setActiveCategory: (category: SettingsCategoryId) => void;
  title: string;
};

function SettingsPanelBody(props: SettingsPanelBodyProps) {
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
            <SettingsCategoryContent {...props} />
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
