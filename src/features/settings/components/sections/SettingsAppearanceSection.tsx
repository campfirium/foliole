import {
  DEFAULT_ACCENT_COLOR_PRESET,
  INTERFACE_FONT_SIZE_MAX,
  INTERFACE_FONT_SIZE_MIN,
  type AccentColorPreset,
  type BaseColorMode
} from '../../model/appearanceSettings';
import {
  INTERFACE_PRESET_OPTION_VALUES,
  MONOSPACE_PRESET_OPTION_VALUES,
  monospacePresetLabel,
  presetLabel
} from '../../model/settingsPanelOptions';

export function SettingsAppearanceSection(props: {
  baseColorMode: BaseColorMode;
  safeAccentColor: AccentColorPreset;
  selectedUiFontValue: string;
  selectedInterfaceFontValue: string;
  selectedMonospaceFontValue: string;
  uiFontOptions: string[];
  interfaceFontOptions: string[];
  monospaceFontOptions: string[];
  interfaceFontSize: number;
  onBaseColorModeChange: (value: BaseColorMode) => void;
  onAccentColorPresetChange: (value: AccentColorPreset) => void;
  onAccentColorPresetReset: () => void;
  onOpenAccentColorPicker: () => void;
  onUiFontSelectionChange: (value: string) => void;
  onInterfaceFontSelectionChange: (value: string) => void;
  onMonospaceFontSelectionChange: (value: string) => void;
  onInterfaceFontSizeChange: (value: number) => void;
  onInterfaceFontSizeReset: () => void;
  accentColorInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const {
    baseColorMode,
    safeAccentColor,
    selectedUiFontValue,
    selectedInterfaceFontValue,
    selectedMonospaceFontValue,
    uiFontOptions,
    interfaceFontOptions,
    monospaceFontOptions,
    interfaceFontSize,
    onBaseColorModeChange,
    onAccentColorPresetChange,
    onAccentColorPresetReset,
    onOpenAccentColorPicker,
    onUiFontSelectionChange,
    onInterfaceFontSelectionChange,
    onMonospaceFontSelectionChange,
    onInterfaceFontSizeChange,
    onInterfaceFontSizeReset,
    accentColorInputRef
  } = props;

  return (
    <>
      <section aria-label="Appearance fonts section" className="settings-group">
        <h3 className="settings-group-title">Color</h3>
        <div className="settings-row"><div className="settings-row-copy"><h4>Base color</h4><p>Choose the foundation color mode for the interface.</p></div><label className="settings-select-wrap"><span className="sr-only">Base color</span><select className="settings-select" onChange={(event) => onBaseColorModeChange(event.target.value as BaseColorMode)} value={baseColorMode}><option value="light">Light</option></select></label></div>
        <div className="settings-row"><div className="settings-row-copy"><h4>Accent color</h4><p>Choose accent color for selected states, links, and quote rendering.</p></div><div className="settings-accent-controls"><button aria-label="Reset accent color" className="settings-reset" disabled={safeAccentColor === DEFAULT_ACCENT_COLOR_PRESET} onClick={onAccentColorPresetReset} type="button">↺</button><button aria-label="Pick accent color" className="settings-accent-trigger" onClick={onOpenAccentColorPicker} type="button"><span aria-hidden="true" className="settings-accent-swatch" style={{ backgroundColor: safeAccentColor }} /></button><input aria-label="Accent color picker" className="settings-accent-native-input" onChange={(event) => onAccentColorPresetChange(event.target.value as AccentColorPreset)} ref={accentColorInputRef} type="color" value={safeAccentColor} /></div></div>
        <div className="settings-row settings-row-readonly"><div className="settings-row-copy"><h4>Theme</h4><p>Theme package management will be added in a follow-up task.</p></div><span className="settings-pill">Planned</span></div>
      </section>
      <section aria-label="Appearance fonts section" className="settings-group">
        <h3 className="settings-group-title">Fonts</h3>
        <div className="settings-row"><div className="settings-row-copy"><h4>Interface font</h4><p>Font used for app chrome and UI controls.</p></div><label className="settings-select-wrap"><span className="sr-only">Interface font</span><select className="settings-select" onChange={(event) => onUiFontSelectionChange(event.target.value)} value={selectedUiFontValue}>{INTERFACE_PRESET_OPTION_VALUES.map((preset) => <option key={preset} value={`ui-preset:${preset}`}>{presetLabel(preset)}</option>)}{uiFontOptions.map((font) => <option key={font} value={`ui-font:${font}`}>{font}</option>)}</select></label></div>
        <div className="settings-row"><div className="settings-row-copy"><h4>Text font</h4><p>Font used in main content text.</p></div><label className="settings-select-wrap"><span className="sr-only">Text font</span><select className="settings-select" onChange={(event) => onInterfaceFontSelectionChange(event.target.value)} value={selectedInterfaceFontValue}>{INTERFACE_PRESET_OPTION_VALUES.map((preset) => <option key={preset} value={`preset:${preset}`}>{presetLabel(preset)}</option>)}{interfaceFontOptions.map((font) => <option key={font} value={`font:${font}`}>{font}</option>)}</select></label></div>
        <div className="settings-row"><div className="settings-row-copy"><h4>Monospace font</h4><p>Code font in fenced blocks and inline code. Monospaced fonts are listed first.</p></div><label className="settings-select-wrap"><span className="sr-only">Monospace font preset</span><select className="settings-select" onChange={(event) => onMonospaceFontSelectionChange(event.target.value)} value={selectedMonospaceFontValue}>{MONOSPACE_PRESET_OPTION_VALUES.map((preset) => <option key={preset} value={`mono-preset:${preset}`}>{monospacePresetLabel(preset)}</option>)}{monospaceFontOptions.map((font) => <option key={font} value={`mono-font:${font}`}>{font}</option>)}</select></label></div>
        <div className="settings-row"><div className="settings-row-copy"><h4>Font size</h4><p>Adjust main content panel font size in pixels.</p></div><div className="settings-slider-wrap"><button aria-label="Reset font size" className="settings-reset" onClick={onInterfaceFontSizeReset} type="button">↺</button><input aria-label="Interface font size" className="settings-range" max={INTERFACE_FONT_SIZE_MAX} min={INTERFACE_FONT_SIZE_MIN} onChange={(event) => onInterfaceFontSizeChange(Number(event.target.value))} step={1} type="range" value={interfaceFontSize} /><span className="settings-range-value">{interfaceFontSize}px</span></div></div>
      </section>
    </>
  );
}
