import type { RefObject } from 'react';

import type { MarkdownSyntaxVisibility } from '../../editor/model/markdownSyntaxSetting';
import type {
  AccentColorPreset,
  BaseColorMode,
  InterfaceFontPreset,
  MonospaceFontPreset
} from '../model/appearanceSettings';
import type { HotkeySettingItem, HotkeyUpdateResult } from '../model/hotkeySettings';
import { SETTINGS_CATEGORIES, type SettingsCategoryId } from '../model/settingsPanelOptions';

import { HotkeySettingsSection } from './HotkeySettingsSection';
import { SettingsAboutSection } from './sections/SettingsAboutSection';
import { SettingsAppearanceSection } from './sections/SettingsAppearanceSection';
import { SettingsEditorSection } from './sections/SettingsEditorSection';
import { SettingsReviewSection } from './sections/SettingsReviewSection';

import { cn } from '@/shared/lib/utils';

export interface SettingsCategoryContentProps {
  activeCategory: SettingsCategoryId;
  accentColorInputRef: RefObject<HTMLInputElement>;
  areFontOptionsReady: boolean;
  baseColorMode: BaseColorMode;
  defaultPriority: number;
  desiredRetention: number;
  enableFuzz: boolean;
  enableShortTerm: boolean;
  hotkeyItems: HotkeySettingItem[];
  interfaceFontOptions: string[];
  interfaceFontSize: number;
  markdownSyntaxVisibility: MarkdownSyntaxVisibility;
  maximumIntervalDays: number;
  monospaceFontOptions: string[];
  onAccentColorPresetChange: (value: AccentColorPreset) => void;
  onAccentColorPresetReset: () => void;
  onBaseColorModeChange: (value: BaseColorMode) => void;
  onCustomInterfaceFontChange: (value: string) => void;
  onCustomMonospaceFontChange: (value: string) => void;
  onCustomUiFontChange: (value: string) => void;
  onDefaultPriorityChange: (value: number) => void;
  onDesiredRetentionChange: (value: number) => void;
  onEnableFuzzChange: (value: boolean) => void;
  onEnableShortTermChange: (value: boolean) => void;
  onHotkeyReset: (commandId: string) => void;
  onHotkeyResetAll: () => void;
  onHotkeyUpdate: (commandId: string, slot: 'primary' | 'secondary', nextLabel: string) => HotkeyUpdateResult;
  onInterfaceFontPresetChange: (value: InterfaceFontPreset) => void;
  onInterfaceFontSizeChange: (value: number) => void;
  onInterfaceFontSizeReset: () => void;
  onMarkdownSyntaxVisibilityChange: (value: MarkdownSyntaxVisibility) => void;
  onMaximumIntervalDaysChange: (value: number) => void;
  onMonospaceFontPresetChange: (value: MonospaceFontPreset) => void;
  onPriorityRatioChange: (value: number) => void;
  onQueueMixRatioFsrsChange: (value: number) => void;
  onQueueMixRatioReadingChange: (value: number) => void;
  onReadingInitialIntervalDaysChange: (value: number) => void;
  onReadingIntervalGrowthFactorMaxChange: (value: number) => void;
  onReadingIntervalGrowthFactorMinChange: (value: number) => void;
  onUiFontPresetChange: (value: InterfaceFontPreset) => void;
  priorityRatio: number;
  queueMixRatioFsrs: number;
  queueMixRatioReading: number;
  readingInitialIntervalMs: number;
  readingIntervalGrowthFactorMax: number;
  readingIntervalGrowthFactorMin: number;
  safeAccentColor: AccentColorPreset;
  selectedInterfaceFontValue: string;
  selectedMonospaceFontValue: string;
  selectedUiFontValue: string;
  uiFontOptions: string[];
}

export function SettingsSidebar(props: {
  activeCategory: SettingsCategoryId;
  setActiveCategory: (category: SettingsCategoryId) => void;
}) {
  return (
    <aside aria-label="Settings categories" className="flex flex-col border-r border-border bg-bg-subtle px-2.5 py-3.5">
      <p className="mb-2.5 px-2.5 text-[0.9rem] font-semibold text-foreground/50">Options</p>
      <nav aria-label="Settings navigation" className="flex flex-col gap-0.5">
        {SETTINGS_CATEGORIES.map((category) => (
          <button
            className={cn(
              'rounded-md px-2.5 py-[7px] text-left text-[0.96rem] text-foreground/80 transition-colors hover:bg-foreground/[0.05]',
              category.id === props.activeCategory && 'bg-foreground/[0.08] font-semibold text-foreground'
            )}
            key={category.id}
            onClick={() => props.setActiveCategory(category.id)}
            type="button"
          >
            {category.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

function AppearanceSettingsContent(props: SettingsCategoryContentProps) {
  return (
    <SettingsAppearanceSection accentColorInputRef={props.accentColorInputRef} areFontOptionsReady={props.areFontOptionsReady} baseColorMode={props.baseColorMode} interfaceFontOptions={props.interfaceFontOptions} interfaceFontSize={props.interfaceFontSize} monospaceFontOptions={props.monospaceFontOptions} onAccentColorPresetChange={props.onAccentColorPresetChange} onAccentColorPresetReset={props.onAccentColorPresetReset} onBaseColorModeChange={props.onBaseColorModeChange} onInterfaceFontSelectionChange={(value) => value.startsWith('preset:') ? props.onInterfaceFontPresetChange(value.slice('preset:'.length) as InterfaceFontPreset) : value.startsWith('font:') && (props.onCustomInterfaceFontChange(value.slice('font:'.length)), props.onInterfaceFontPresetChange('custom'))} onInterfaceFontSizeChange={props.onInterfaceFontSizeChange} onInterfaceFontSizeReset={props.onInterfaceFontSizeReset} onMonospaceFontSelectionChange={(value) => value.startsWith('mono-preset:') ? props.onMonospaceFontPresetChange(value.slice('mono-preset:'.length) as MonospaceFontPreset) : value.startsWith('mono-font:') && (props.onCustomMonospaceFontChange(value.slice('mono-font:'.length)), props.onMonospaceFontPresetChange('custom'))} onOpenAccentColorPicker={() => props.accentColorInputRef.current?.click()} onUiFontSelectionChange={(value) => value.startsWith('ui-preset:') ? props.onUiFontPresetChange(value.slice('ui-preset:'.length) as InterfaceFontPreset) : value.startsWith('ui-font:') && (props.onCustomUiFontChange(value.slice('ui-font:'.length)), props.onUiFontPresetChange('custom'))} safeAccentColor={props.safeAccentColor} selectedInterfaceFontValue={props.selectedInterfaceFontValue} selectedMonospaceFontValue={props.selectedMonospaceFontValue} selectedUiFontValue={props.selectedUiFontValue} uiFontOptions={props.uiFontOptions} />
  );
}

function ReviewSettingsContent(props: SettingsCategoryContentProps) {
  return (
    <SettingsReviewSection defaultPriority={props.defaultPriority} desiredRetention={props.desiredRetention} enableFuzz={props.enableFuzz} enableShortTerm={props.enableShortTerm} maximumIntervalDays={props.maximumIntervalDays} onDefaultPriorityChange={props.onDefaultPriorityChange} onDesiredRetentionChange={props.onDesiredRetentionChange} onEnableFuzzChange={props.onEnableFuzzChange} onEnableShortTermChange={props.onEnableShortTermChange} onMaximumIntervalDaysChange={props.onMaximumIntervalDaysChange} onPriorityRatioChange={props.onPriorityRatioChange} onQueueMixRatioFsrsChange={props.onQueueMixRatioFsrsChange} onQueueMixRatioReadingChange={props.onQueueMixRatioReadingChange} onReadingInitialIntervalDaysChange={props.onReadingInitialIntervalDaysChange} onReadingIntervalGrowthFactorMaxChange={props.onReadingIntervalGrowthFactorMaxChange} onReadingIntervalGrowthFactorMinChange={props.onReadingIntervalGrowthFactorMinChange} priorityRatio={props.priorityRatio} queueMixRatioFsrs={props.queueMixRatioFsrs} queueMixRatioReading={props.queueMixRatioReading} readingInitialIntervalMs={props.readingInitialIntervalMs} readingIntervalGrowthFactorMax={props.readingIntervalGrowthFactorMax} readingIntervalGrowthFactorMin={props.readingIntervalGrowthFactorMin} />
  );
}

export function SettingsCategoryContent(props: SettingsCategoryContentProps) {
  if (props.activeCategory === 'editor') {
    return <SettingsEditorSection markdownSyntaxVisibility={props.markdownSyntaxVisibility} onMarkdownSyntaxVisibilityChange={props.onMarkdownSyntaxVisibilityChange} />;
  }
  if (props.activeCategory === 'appearance') {
    return <AppearanceSettingsContent {...props} />;
  }
  if (props.activeCategory === 'review') {
    return <ReviewSettingsContent {...props} />;
  }
  if (props.activeCategory === 'about') {
    return <SettingsAboutSection />;
  }
  return <HotkeySettingsSection items={props.hotkeyItems} onReset={props.onHotkeyReset} onResetAll={props.onHotkeyResetAll} onUpdate={props.onHotkeyUpdate} />;
}
