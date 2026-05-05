import { useEffect, useMemo, useRef, useState } from 'react';

import { setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';
import { AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../../shared/ui';
import type { MarkdownSyntaxVisibility } from '../../editor/model/markdownSyntaxSetting';
import {
  DEFAULT_ACCENT_COLOR_PRESET,
  type AccentColorPreset,
  type BaseColorMode,
  type InterfaceFontPreset,
  type MonospaceFontPreset
} from '../model/appearanceSettings';
import type { HotkeySettingItem, HotkeyUpdateResult } from '../model/hotkeySettings';
import {
  getInitialSettingsCategory,
  SETTINGS_CATEGORIES,
  SETTINGS_CATEGORY_STORAGE_KEY,
  type SettingsCategoryId
} from '../model/settingsPanelOptions';
import { listAvailableSystemFonts } from '../model/systemFonts';

import {
  SettingsCategoryContent,
  SettingsSidebar,
  type SettingsCategoryContentProps
} from './SettingsPanelSections';

interface SettingsPanelProps {
  baseColorMode: BaseColorMode;
  accentColorPreset: AccentColorPreset;
  customUiFont: string;
  customInterfaceFont: string;
  customMonospaceFont: string;
  uiFontPreset: InterfaceFontPreset;
  interfaceFontPreset: InterfaceFontPreset;
  interfaceFontSize: number;
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
  markdownSyntaxVisibility: MarkdownSyntaxVisibility;
  monospaceFontPreset: MonospaceFontPreset;
  hotkeyItems: HotkeySettingItem[];
  onClose: () => void;
  onBaseColorModeChange: (value: BaseColorMode) => void;
  onAccentColorPresetChange: (value: AccentColorPreset) => void;
  onAccentColorPresetReset: () => void;
  onCustomUiFontChange: (value: string) => void;
  onCustomInterfaceFontChange: (value: string) => void;
  onCustomMonospaceFontChange: (value: string) => void;
  onUiFontPresetChange: (value: InterfaceFontPreset) => void;
  onInterfaceFontPresetChange: (value: InterfaceFontPreset) => void;
  onInterfaceFontSizeChange: (value: number) => void;
  onInterfaceFontSizeReset: () => void;
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
  onMarkdownSyntaxVisibilityChange: (value: MarkdownSyntaxVisibility) => void;
  onMonospaceFontPresetChange: (value: MonospaceFontPreset) => void;
  onHotkeyUpdate: (commandId: string, slot: 'primary' | 'secondary', nextLabel: string) => HotkeyUpdateResult;
  onHotkeyReset: (commandId: string) => void;
  onHotkeyResetAll: () => void;
}

function ensureAccentHex(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : DEFAULT_ACCENT_COLOR_PRESET;
}

export function SettingsPanel(props: SettingsPanelProps) {
  return <SettingsPanelContent {...props} />;
}

function SettingsPanelContent(props: SettingsPanelProps) {
  const state = useSettingsPanelViewState(props);
  return <SettingsPanelBody {...props} {...state} />;
}

function useSettingsPanelViewState(props: SettingsPanelProps) {
  const accentColorInputRef = useRef<HTMLInputElement>(null);
  const safeAccentColor = ensureAccentHex(props.accentColorPreset);
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>(() => getInitialSettingsCategory());
  const [availableSystemFonts, setAvailableSystemFonts] = useState<string[]>([]);
  const [availableMonospaceFonts, setAvailableMonospaceFonts] = useState<string[]>([]);
  const [areFontOptionsReady, setAreFontOptionsReady] = useState(false);

  useEffect(() => {
    let alive = true;
    listAvailableSystemFonts()
      .then((fonts) => {
        if (!alive) {
          return;
        }
        setAvailableSystemFonts(fonts.fonts);
        setAvailableMonospaceFonts(fonts.monospaceFonts);
      })
      .finally(() => {
        if (alive) {
          setAreFontOptionsReady(true);
        }
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => setWhitelistedLocalStorageItem(SETTINGS_CATEGORY_STORAGE_KEY, activeCategory), [activeCategory]);

  const allFontOptions = useMemo(
    () =>
      [...new Set([...availableSystemFonts, ...availableMonospaceFonts, props.customUiFont, props.customInterfaceFont, props.customMonospaceFont].filter(Boolean))].sort((l, r) =>
        l.localeCompare(r)
      ),
    [availableMonospaceFonts, availableSystemFonts, props.customInterfaceFont, props.customMonospaceFont, props.customUiFont]
  );
  const uiFontOptions = useMemo(() => allFontOptions, [allFontOptions]);
  const interfaceFontOptions = useMemo(() => allFontOptions, [allFontOptions]);
  const monospaceFontOptions = useMemo(() => {
    const mono = new Set(availableMonospaceFonts);
    return [...allFontOptions.filter((font) => mono.has(font)), ...allFontOptions.filter((font) => !mono.has(font))];
  }, [allFontOptions, availableMonospaceFonts]);

  const selectedUiFontValue = props.uiFontPreset === 'custom' ? (props.customUiFont ? `ui-font:${props.customUiFont}` : 'ui-preset:default') : `ui-preset:${props.uiFontPreset}`;
  const selectedInterfaceFontValue = props.interfaceFontPreset === 'custom' ? (props.customInterfaceFont ? `font:${props.customInterfaceFont}` : 'preset:default') : `preset:${props.interfaceFontPreset}`;
  const selectedMonospaceFontValue = props.monospaceFontPreset === 'custom' ? (props.customMonospaceFont ? `mono-font:${props.customMonospaceFont}` : 'mono-preset:default') : `mono-preset:${props.monospaceFontPreset}`;
  const title = SETTINGS_CATEGORIES.find((category) => category.id === activeCategory)?.label ?? 'Settings';
  return {
    accentColorInputRef,
    activeCategory,
    areFontOptionsReady,
    interfaceFontOptions,
    monospaceFontOptions,
    safeAccentColor,
    selectedInterfaceFontValue,
    selectedMonospaceFontValue,
    selectedUiFontValue,
    setActiveCategory,
    title,
    uiFontOptions
  };
}

type SettingsPanelBodyProps = SettingsCategoryContentProps & {
  activeCategory: SettingsCategoryId;
  accentColorInputRef: React.RefObject<HTMLInputElement>;
  areFontOptionsReady: boolean;
  baseColorMode: BaseColorMode;
  hotkeyItems: HotkeySettingItem[];
  interfaceFontOptions: string[];
  interfaceFontSize: number;
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
  markdownSyntaxVisibility: MarkdownSyntaxVisibility;
  monospaceFontOptions: string[];
  onAccentColorPresetChange: (value: AccentColorPreset) => void;
  onAccentColorPresetReset: () => void;
  onBaseColorModeChange: (value: BaseColorMode) => void;
  onClose: () => void;
  onCustomInterfaceFontChange: (value: string) => void;
  onCustomMonospaceFontChange: (value: string) => void;
  onCustomUiFontChange: (value: string) => void;
  onHotkeyReset: (commandId: string) => void;
  onHotkeyResetAll: () => void;
  onHotkeyUpdate: (commandId: string, slot: 'primary' | 'secondary', nextLabel: string) => HotkeyUpdateResult;
  onInterfaceFontPresetChange: (value: InterfaceFontPreset) => void;
  onInterfaceFontSizeChange: (value: number) => void;
  onInterfaceFontSizeReset: () => void;
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
  onMarkdownSyntaxVisibilityChange: (value: MarkdownSyntaxVisibility) => void;
  onMonospaceFontPresetChange: (value: MonospaceFontPreset) => void;
  onUiFontPresetChange: (value: InterfaceFontPreset) => void;
  safeAccentColor: AccentColorPreset;
  selectedInterfaceFontValue: string;
  selectedMonospaceFontValue: string;
  selectedUiFontValue: string;
  setActiveCategory: (category: SettingsCategoryId) => void;
  title: string;
  uiFontOptions: string[];
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
          <div className="overflow-auto p-4 pb-5">
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
