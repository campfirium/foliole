import { useMemo, useState } from 'react';

import type { MarkdownSyntaxVisibility } from '../../editor/model/markdownSyntaxSetting';
import {
  INTERFACE_FONT_SIZE_MAX,
  INTERFACE_FONT_SIZE_MIN,
  type InterfaceFontPreset,
  type MonospaceFontPreset
} from '../model/appearanceSettings';

type SettingsCategoryId = 'about' | 'editor' | 'appearance' | 'hotkeys';

interface SettingsPanelProps {
  interfaceFontPreset: InterfaceFontPreset;
  interfaceFontSize: number;
  markdownSyntaxVisibility: MarkdownSyntaxVisibility;
  monospaceFontPreset: MonospaceFontPreset;
  onClose: () => void;
  onInterfaceFontPresetChange: (value: InterfaceFontPreset) => void;
  onInterfaceFontSizeChange: (value: number) => void;
  onInterfaceFontSizeReset: () => void;
  onMarkdownSyntaxVisibilityChange: (value: MarkdownSyntaxVisibility) => void;
  onMonospaceFontPresetChange: (value: MonospaceFontPreset) => void;
}

const SETTINGS_CATEGORIES: Array<{ id: SettingsCategoryId; label: string }> = [
  { id: 'about', label: 'About' },
  { id: 'editor', label: 'Editor' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'hotkeys', label: 'Hotkeys' }
];

export function SettingsPanel({
  interfaceFontPreset,
  interfaceFontSize,
  markdownSyntaxVisibility,
  monospaceFontPreset,
  onClose,
  onInterfaceFontPresetChange,
  onInterfaceFontSizeChange,
  onInterfaceFontSizeReset,
  onMarkdownSyntaxVisibilityChange,
  onMonospaceFontPresetChange
}: SettingsPanelProps) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>('editor');
  const title = useMemo(
    () => SETTINGS_CATEGORIES.find((category) => category.id === activeCategory)?.label ?? 'Settings',
    [activeCategory]
  );

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
                onClick={() => setActiveCategory(category.id)}
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
                <h3 className="settings-group-title">Fonts</h3>
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <h4>Interface font</h4>
                    <p>Font used in the main content panel text.</p>
                  </div>
                  <label className="settings-select-wrap">
                    <span className="sr-only">Interface font preset</span>
                    <select
                      className="settings-select"
                      onChange={(event) => onInterfaceFontPresetChange(event.target.value as InterfaceFontPreset)}
                      value={interfaceFontPreset}
                    >
                      <option value="default">Default</option>
                      <option value="inter">Inter</option>
                      <option value="system">System UI</option>
                      <option value="source-sans">Source Sans</option>
                      <option value="serif">Serif</option>
                      <option value="rounded">Rounded</option>
                    </select>
                  </label>
                </div>
                <div className="settings-row">
                  <div className="settings-row-copy">
                    <h4>Monospace font</h4>
                    <p>Monospace font used in code and fenced blocks in main panel.</p>
                  </div>
                  <label className="settings-select-wrap">
                    <span className="sr-only">Monospace font preset</span>
                    <select
                      className="settings-select"
                      onChange={(event) => onMonospaceFontPresetChange(event.target.value as MonospaceFontPreset)}
                      value={monospaceFontPreset}
                    >
                      <option value="default">Default</option>
                      <option value="jetbrains">JetBrains Mono</option>
                      <option value="cascadia">Cascadia Code</option>
                      <option value="consolas">Consolas</option>
                      <option value="fira">Fira Code</option>
                      <option value="sarasa">Sarasa Mono</option>
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
            <section aria-label="Hotkeys settings section" className="settings-group">
              <h3 className="settings-group-title">Hotkeys</h3>
              <div className="settings-row settings-row-readonly">
                <div className="settings-row-copy">
                  <h4>Command shortcuts</h4>
                  <p>Shortcut customization panel will be added in a follow-up task.</p>
                </div>
                <span className="settings-pill">Planned</span>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </section>
  );
}
