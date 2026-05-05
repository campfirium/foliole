import { useEffect, useMemo, useRef, useState } from 'react';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';
import type { MarkdownSyntaxVisibility } from '../../editor/model/markdownSyntaxSetting';
import {
  DEFAULT_ACCENT_COLOR_PRESET,
  type AccentColorPreset,
  type BaseColorMode,
  INTERFACE_FONT_SIZE_MAX,
  INTERFACE_FONT_SIZE_MIN,
  type InterfaceFontPreset,
  type MonospaceFontPreset
} from '../model/appearanceSettings';
import type { HotkeySettingItem, HotkeyUpdateResult } from '../model/hotkeySettings';
import { listAvailableSystemFonts } from '../model/systemFonts';

import { HotkeySettingsSection } from './HotkeySettingsSection';

type SettingsCategoryId = 'about' | 'editor' | 'appearance' | 'hotkeys';

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

const SETTINGS_CATEGORIES: Array<{ id: SettingsCategoryId; label: string }> = [
  { id: 'about', label: 'About' },
  { id: 'editor', label: 'Editor' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'hotkeys', label: 'Hotkeys' }
];

const SETTINGS_CATEGORY_STORAGE_KEY = APP_SETTINGS_STORAGE_KEYS.settingsActiveCategory;
const INTERFACE_PRESET_OPTION_VALUES: InterfaceFontPreset[] = ['default', 'inter', 'system', 'source-sans', 'serif', 'rounded'];
const MONOSPACE_PRESET_OPTION_VALUES: MonospaceFontPreset[] = ['default', 'jetbrains', 'cascadia', 'consolas', 'fira', 'sarasa'];

function isSettingsCategoryId(value: string): value is SettingsCategoryId {
  return SETTINGS_CATEGORIES.some((category) => category.id === value);
}

function getInitialSettingsCategory(): SettingsCategoryId {
  const raw = getWhitelistedLocalStorageItem(SETTINGS_CATEGORY_STORAGE_KEY);
  return raw && isSettingsCategoryId(raw) ? raw : 'editor';
}

function presetLabel(preset: InterfaceFontPreset) {
  switch (preset) {
    case 'default':
      return 'Default';
    case 'inter':
      return 'Inter';
    case 'system':
      return 'System UI';
    case 'source-sans':
      return 'Source Sans';
    case 'serif':
      return 'Serif';
    case 'rounded':
      return 'Rounded';
    default:
      return 'Custom';
  }
}

function monospacePresetLabel(preset: MonospaceFontPreset) {
  switch (preset) {
    case 'default':
      return 'Default';
    case 'jetbrains':
      return 'JetBrains Mono';
    case 'cascadia':
      return 'Cascadia Code';
    case 'consolas':
      return 'Consolas';
    case 'fira':
      return 'Fira Code';
    case 'sarasa':
      return 'Sarasa Mono';
    default:
      return 'Custom';
  }
}

function ensureAccentHex(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : DEFAULT_ACCENT_COLOR_PRESET;
}

export function SettingsPanel({
  baseColorMode,
  accentColorPreset,
  customUiFont,
  customInterfaceFont,
  customMonospaceFont,
  uiFontPreset,
  interfaceFontPreset,
  interfaceFontSize,
  markdownSyntaxVisibility,
  monospaceFontPreset,
  hotkeyItems,
  onClose,
  onBaseColorModeChange,
  onAccentColorPresetChange,
  onAccentColorPresetReset,
  onCustomUiFontChange,
  onCustomInterfaceFontChange,
  onCustomMonospaceFontChange,
  onUiFontPresetChange,
  onInterfaceFontPresetChange,
  onInterfaceFontSizeChange,
  onInterfaceFontSizeReset,
  onMarkdownSyntaxVisibilityChange,
  onMonospaceFontPresetChange,
  onHotkeyUpdate,
  onHotkeyReset,
  onHotkeyResetAll
}: SettingsPanelProps) {
  const accentColorInputRef = useRef<HTMLInputElement | null>(null);
  const safeAccentColor = ensureAccentHex(accentColorPreset);
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>(() => getInitialSettingsCategory());
  const [availableSystemFonts, setAvailableSystemFonts] = useState<string[]>([]);
  const [availableMonospaceFonts, setAvailableMonospaceFonts] = useState<string[]>([]);
  const uiFontOptions = useMemo(() => {
    const all = new Set(availableSystemFonts);
    if (customUiFont) {
      all.add(customUiFont);
    }
    return [...all].sort((left, right) => left.localeCompare(right));
  }, [availableSystemFonts, customUiFont]);
  const interfaceFontOptions = useMemo(() => {
    const all = new Set(availableSystemFonts);
    if (customInterfaceFont) {
      all.add(customInterfaceFont);
    }
    return [...all].sort((left, right) => left.localeCompare(right));
  }, [availableSystemFonts, customInterfaceFont]);
  const monospaceFontOptions = useMemo(() => {
    const all = new Set(availableSystemFonts);
    if (customMonospaceFont) {
      all.add(customMonospaceFont);
    }
    const sorted = [...all].sort((left, right) => left.localeCompare(right));
    const monoSet = new Set(availableMonospaceFonts);
    const monospaceFirst = sorted.filter((font) => monoSet.has(font));
    const remaining = sorted.filter((font) => !monoSet.has(font));
    return [...monospaceFirst, ...remaining];
  }, [availableMonospaceFonts, availableSystemFonts, customMonospaceFont]);
  const selectedUiFontValue =
    uiFontPreset === 'custom' ? (customUiFont ? `ui-font:${customUiFont}` : 'ui-preset:default') : `ui-preset:${uiFontPreset}`;
  const selectedInterfaceFontValue =
    interfaceFontPreset === 'custom'
      ? customInterfaceFont
        ? `font:${customInterfaceFont}`
        : 'preset:default'
      : `preset:${interfaceFontPreset}`;
  const selectedMonospaceFontValue =
    monospaceFontPreset === 'custom'
      ? customMonospaceFont
        ? `mono-font:${customMonospaceFont}`
        : 'mono-preset:default'
      : `mono-preset:${monospaceFontPreset}`;
  const title = useMemo(
    () => SETTINGS_CATEGORIES.find((category) => category.id === activeCategory)?.label ?? 'Settings',
    [activeCategory]
  );

  useEffect(() => {
    let alive = true;
    listAvailableSystemFonts().then((fonts) => {
      if (alive) {
        setAvailableSystemFonts(fonts.fonts);
        setAvailableMonospaceFonts(fonts.monospaceFonts);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setWhitelistedLocalStorageItem(SETTINGS_CATEGORY_STORAGE_KEY, activeCategory);
  }, [activeCategory]);

  const handleCategoryChange = (category: SettingsCategoryId) => {
    setActiveCategory(category);
  };

  const handleInterfaceFontSelectionChange = (value: string) => {
    if (value.startsWith('preset:')) {
      const preset = value.slice('preset:'.length) as InterfaceFontPreset;
      onInterfaceFontPresetChange(preset);
      return;
    }
    if (value.startsWith('font:')) {
      const font = value.slice('font:'.length);
      onCustomInterfaceFontChange(font);
      onInterfaceFontPresetChange('custom');
    }
  };

  const handleUiFontSelectionChange = (value: string) => {
    if (value.startsWith('ui-preset:')) {
      const preset = value.slice('ui-preset:'.length) as InterfaceFontPreset;
      onUiFontPresetChange(preset);
      return;
    }
    if (value.startsWith('ui-font:')) {
      const font = value.slice('ui-font:'.length);
      onCustomUiFontChange(font);
      onUiFontPresetChange('custom');
    }
  };

  const handleMonospaceFontSelectionChange = (value: string) => {
    if (value.startsWith('mono-preset:')) {
      const preset = value.slice('mono-preset:'.length) as MonospaceFontPreset;
      onMonospaceFontPresetChange(preset);
      return;
    }
    if (value.startsWith('mono-font:')) {
      const font = value.slice('mono-font:'.length);
      onCustomMonospaceFontChange(font);
      onMonospaceFontPresetChange('custom');
    }
  };

  const handleOpenAccentColorPicker = () => {
    accentColorInputRef.current?.click();
  };

  return (
    <section aria-label="Settings" className="settings-root" onMouseDown={onClose} role="presentation">
      <div aria-label="Settings dialog" aria-modal="true" className="settings-shell" onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <aside className="settings-sidebar" aria-label="Settings categories">
          <p className="settings-sidebar-title">Options</p>
          <nav className="settings-nav" aria-label="Settings navigation">
            {SETTINGS_CATEGORIES.map((category) => (
              <button
                className={`settings-nav-item${category.id === activeCategory ? ' settings-nav-item-active' : ''}`}
                key={category.id}
                onClick={() => handleCategoryChange(category.id)}
                type="button"
              >
                {category.label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="settings-content">
          <header className="settings-content-header">
            <h2>{title}</h2>
          </header>

          {activeCategory === 'editor' ? (
            <section aria-label="Editor settings section" className="settings-group">
              <h3 className="settings-group-title">Live markdown</h3>
              <div className="settings-row">
                <div className="settings-row-copy">
                  <h4>Markdown syntax visibility</h4>
                  <p>Show markdown markers on active line, or keep them hidden.</p>
                </div>
                <label className="settings-select-wrap">
                  <span className="sr-only">Markdown syntax visibility</span>
                  <select
                    className="settings-select"
                    onChange={(event) => onMarkdownSyntaxVisibilityChange(event.target.value as MarkdownSyntaxVisibility)}
                    value={markdownSyntaxVisibility}
                  >
                    <option value="hidden">Hidden</option>
                    <option value="visible">Visible on active line</option>
                  </select>
                </label>
              </div>
            </section>
          ) : null}

          {activeCategory === 'appearance' ? (
            <>
              <section aria-label="Appearance fonts section" className="settings-group">
                <h3 className="settings-group-title">Color</h3>
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <h4>Base color</h4>
                    <p>Choose the foundation color mode for the interface.</p>
                  </div>
                  <label className="settings-select-wrap">
                    <span className="sr-only">Base color</span>
                    <select
                      className="settings-select"
                      onChange={(event) => onBaseColorModeChange(event.target.value as BaseColorMode)}
                      value={baseColorMode}
                    >
                      <option value="light">Light</option>
                    </select>
                  </label>
                </div>
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <h4>Accent color</h4>
                    <p>Choose accent color for selected states, links, and quote rendering.</p>
                  </div>
                  <div className="settings-accent-controls">
                    <button
                      aria-label="Reset accent color"
                      className="settings-reset"
                      disabled={safeAccentColor === DEFAULT_ACCENT_COLOR_PRESET}
                      onClick={onAccentColorPresetReset}
                      type="button"
                    >
                      ↺
                    </button>
                    <button aria-label="Pick accent color" className="settings-accent-trigger" onClick={handleOpenAccentColorPicker} type="button">
                      <span aria-hidden="true" className="settings-accent-swatch" style={{ backgroundColor: safeAccentColor }} />
                    </button>
                    <input
                      aria-label="Accent color picker"
                      className="settings-accent-native-input"
                      onChange={(event) => onAccentColorPresetChange(event.target.value)}
                      ref={accentColorInputRef}
                      type="color"
                      value={safeAccentColor}
                    />
                  </div>
                </div>
                <div className="settings-row settings-row-readonly">
                  <div className="settings-row-copy">
                    <h4>Theme</h4>
                    <p>Theme package management will be added in a follow-up task.</p>
                  </div>
                  <span className="settings-pill">Planned</span>
                </div>
              </section>
              <section aria-label="Appearance fonts section" className="settings-group">
                <h3 className="settings-group-title">Fonts</h3>
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <h4>Interface font</h4>
                    <p>Font used for app chrome and UI controls.</p>
                  </div>
                  <label className="settings-select-wrap">
                    <span className="sr-only">Interface font</span>
                    <select
                      className="settings-select"
                      onChange={(event) => handleUiFontSelectionChange(event.target.value)}
                      value={selectedUiFontValue}
                    >
                      {INTERFACE_PRESET_OPTION_VALUES.map((preset) => (
                        <option key={preset} value={`ui-preset:${preset}`}>
                          {presetLabel(preset)}
                        </option>
                      ))}
                      {uiFontOptions.map((font) => (
                        <option key={font} value={`ui-font:${font}`}>
                          {font}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <h4>Text font</h4>
                    <p>Font used in main content text.</p>
                  </div>
                  <label className="settings-select-wrap">
                    <span className="sr-only">Text font</span>
                    <select
                      className="settings-select"
                      onChange={(event) => handleInterfaceFontSelectionChange(event.target.value)}
                      value={selectedInterfaceFontValue}
                    >
                      {INTERFACE_PRESET_OPTION_VALUES.map((preset) => (
                        <option key={preset} value={`preset:${preset}`}>
                          {presetLabel(preset)}
                        </option>
                      ))}
                      {interfaceFontOptions.map((font) => (
                        <option key={font} value={`font:${font}`}>
                          {font}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <h4>Monospace font</h4>
                    <p>Code font in fenced blocks and inline code. Monospaced fonts are listed first.</p>
                  </div>
                  <label className="settings-select-wrap">
                    <span className="sr-only">Monospace font preset</span>
                    <select
                      className="settings-select"
                      onChange={(event) => handleMonospaceFontSelectionChange(event.target.value)}
                      value={selectedMonospaceFontValue}
                    >
                      {MONOSPACE_PRESET_OPTION_VALUES.map((preset) => (
                        <option key={preset} value={`mono-preset:${preset}`}>
                          {monospacePresetLabel(preset)}
                        </option>
                      ))}
                      {monospaceFontOptions.map((font) => (
                        <option key={font} value={`mono-font:${font}`}>
                          {font}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <h4>Font size</h4>
                    <p>Adjust main content panel font size in pixels.</p>
                  </div>
                  <div className="settings-slider-wrap">
                    <button aria-label="Reset font size" className="settings-reset" onClick={onInterfaceFontSizeReset} type="button">
                      ↺
                    </button>
                    <input
                      aria-label="Interface font size"
                      className="settings-range"
                      max={INTERFACE_FONT_SIZE_MAX}
                      min={INTERFACE_FONT_SIZE_MIN}
                      onChange={(event) => onInterfaceFontSizeChange(Number(event.target.value))}
                      step={1}
                      type="range"
                      value={interfaceFontSize}
                    />
                    <span className="settings-range-value">{interfaceFontSize}px</span>
                  </div>
                </div>
              </section>
            </>
          ) : null}

          {activeCategory === 'about' ? (
            <section aria-label="About settings section" className="settings-group">
              <h3 className="settings-group-title">Application</h3>
              <div className="settings-row settings-row-readonly">
                <div className="settings-row-copy">
                  <h4>Foliole desktop</h4>
                  <p>Reader-first outlining and review workflow built with Tauri + React.</p>
                </div>
                <span className="settings-pill">v0.1.0</span>
              </div>
            </section>
          ) : null}

          {activeCategory === 'hotkeys' ? (
            <HotkeySettingsSection items={hotkeyItems} onReset={onHotkeyReset} onResetAll={onHotkeyResetAll} onUpdate={onHotkeyUpdate} />
          ) : null}
        </div>
      </div>
    </section>
  );
}
