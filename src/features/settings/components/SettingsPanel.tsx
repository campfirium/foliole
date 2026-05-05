import { useEffect, useMemo, useRef, useState } from 'react';

import { setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';
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

import { HotkeySettingsSection } from './HotkeySettingsSection';
import { SettingsAboutSection } from './sections/SettingsAboutSection';
import { SettingsAppearanceSection } from './sections/SettingsAppearanceSection';
import { SettingsEditorSection } from './sections/SettingsEditorSection';

interface SettingsPanelProps {
  baseColorMode: BaseColorMode;
  accentColorPreset: AccentColorPreset;
  customUiFont: string;
  customInterfaceFont: string;
  customMonospaceFont: string;
  uiFontPreset: InterfaceFontPreset;
  interfaceFontPreset: InterfaceFontPreset;
  interfaceFontSize: number;
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
  onMarkdownSyntaxVisibilityChange: (value: MarkdownSyntaxVisibility) => void;
  onMonospaceFontPresetChange: (value: MonospaceFontPreset) => void;
  onHotkeyUpdate: (commandId: string, nextLabel: string) => HotkeyUpdateResult;
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

  useEffect(() => {
    let alive = true;
    listAvailableSystemFonts().then((fonts) => alive && (setAvailableSystemFonts(fonts.fonts), setAvailableMonospaceFonts(fonts.monospaceFonts)));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => setWhitelistedLocalStorageItem(SETTINGS_CATEGORY_STORAGE_KEY, activeCategory), [activeCategory]);

  const sortedFonts = (custom: string) => [...new Set([...availableSystemFonts, ...(custom ? [custom] : [])])].sort((l, r) => l.localeCompare(r));
  const uiFontOptions = useMemo(() => sortedFonts(props.customUiFont), [availableSystemFonts, props.customUiFont]);
  const interfaceFontOptions = useMemo(() => sortedFonts(props.customInterfaceFont), [availableSystemFonts, props.customInterfaceFont]);
  const monospaceFontOptions = useMemo(() => {
    const sorted = sortedFonts(props.customMonospaceFont);
    const mono = new Set(availableMonospaceFonts);
    return [...sorted.filter((font) => mono.has(font)), ...sorted.filter((font) => !mono.has(font))];
  }, [availableMonospaceFonts, availableSystemFonts, props.customMonospaceFont]);

  const selectedUiFontValue = props.uiFontPreset === 'custom' ? (props.customUiFont ? `ui-font:${props.customUiFont}` : 'ui-preset:default') : `ui-preset:${props.uiFontPreset}`;
  const selectedInterfaceFontValue = props.interfaceFontPreset === 'custom' ? (props.customInterfaceFont ? `font:${props.customInterfaceFont}` : 'preset:default') : `preset:${props.interfaceFontPreset}`;
  const selectedMonospaceFontValue = props.monospaceFontPreset === 'custom' ? (props.customMonospaceFont ? `mono-font:${props.customMonospaceFont}` : 'mono-preset:default') : `mono-preset:${props.monospaceFontPreset}`;
  const title = SETTINGS_CATEGORIES.find((category) => category.id === activeCategory)?.label ?? 'Settings';
  return { accentColorInputRef, activeCategory, interfaceFontOptions, monospaceFontOptions, safeAccentColor, selectedInterfaceFontValue, selectedMonospaceFontValue, selectedUiFontValue, setActiveCategory, title, uiFontOptions };
}

function SettingsPanelBody(props: {
  activeCategory: SettingsCategoryId;
  accentColorInputRef: React.RefObject<HTMLInputElement>;
  baseColorMode: BaseColorMode;
  hotkeyItems: HotkeySettingItem[];
  interfaceFontOptions: string[];
  interfaceFontSize: number;
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
  onHotkeyUpdate: (commandId: string, nextLabel: string) => HotkeyUpdateResult;
  onInterfaceFontPresetChange: (value: InterfaceFontPreset) => void;
  onInterfaceFontSizeChange: (value: number) => void;
  onInterfaceFontSizeReset: () => void;
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
}) {
  return (
    <section aria-label="Settings" className="settings-root" onMouseDown={props.onClose} role="presentation">
      <div aria-label="Settings dialog" aria-modal="true" className="settings-shell" onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <aside aria-label="Settings categories" className="settings-sidebar"><p className="settings-sidebar-title">Options</p><nav aria-label="Settings navigation" className="settings-nav">{SETTINGS_CATEGORIES.map((category) => <button className={`settings-nav-item${category.id === props.activeCategory ? ' settings-nav-item-active' : ''}`} key={category.id} onClick={() => props.setActiveCategory(category.id)} type="button">{category.label}</button>)}</nav></aside>
        <div className="settings-content"><header className="settings-content-header"><h2>{props.title}</h2></header>
          {props.activeCategory === 'editor' ? <SettingsEditorSection markdownSyntaxVisibility={props.markdownSyntaxVisibility} onMarkdownSyntaxVisibilityChange={props.onMarkdownSyntaxVisibilityChange} /> : null}
          {props.activeCategory === 'appearance' ? <SettingsAppearanceSection accentColorInputRef={props.accentColorInputRef} baseColorMode={props.baseColorMode} interfaceFontOptions={props.interfaceFontOptions} interfaceFontSize={props.interfaceFontSize} monospaceFontOptions={props.monospaceFontOptions} onAccentColorPresetChange={props.onAccentColorPresetChange} onAccentColorPresetReset={props.onAccentColorPresetReset} onBaseColorModeChange={props.onBaseColorModeChange} onInterfaceFontSelectionChange={(value) => value.startsWith('preset:') ? props.onInterfaceFontPresetChange(value.slice('preset:'.length) as InterfaceFontPreset) : value.startsWith('font:') && (props.onCustomInterfaceFontChange(value.slice('font:'.length)), props.onInterfaceFontPresetChange('custom'))} onInterfaceFontSizeChange={props.onInterfaceFontSizeChange} onInterfaceFontSizeReset={props.onInterfaceFontSizeReset} onMonospaceFontSelectionChange={(value) => value.startsWith('mono-preset:') ? props.onMonospaceFontPresetChange(value.slice('mono-preset:'.length) as MonospaceFontPreset) : value.startsWith('mono-font:') && (props.onCustomMonospaceFontChange(value.slice('mono-font:'.length)), props.onMonospaceFontPresetChange('custom'))} onOpenAccentColorPicker={() => props.accentColorInputRef.current?.click()} onUiFontSelectionChange={(value) => value.startsWith('ui-preset:') ? props.onUiFontPresetChange(value.slice('ui-preset:'.length) as InterfaceFontPreset) : value.startsWith('ui-font:') && (props.onCustomUiFontChange(value.slice('ui-font:'.length)), props.onUiFontPresetChange('custom'))} safeAccentColor={props.safeAccentColor} selectedInterfaceFontValue={props.selectedInterfaceFontValue} selectedMonospaceFontValue={props.selectedMonospaceFontValue} selectedUiFontValue={props.selectedUiFontValue} uiFontOptions={props.uiFontOptions} /> : null}
          {props.activeCategory === 'about' ? <SettingsAboutSection /> : null}
          {props.activeCategory === 'hotkeys' ? <HotkeySettingsSection items={props.hotkeyItems} onReset={props.onHotkeyReset} onResetAll={props.onHotkeyResetAll} onUpdate={props.onHotkeyUpdate} /> : null}
        </div>
      </div>
    </section>
  );
}
