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
  areFontOptionsReady: boolean;
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
  accentColorInputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <>
      <section aria-label="Appearance fonts section" className="settings-group">
        <h3 className="settings-group-title">Color</h3>
        <div className="settings-row"><div className="settings-row-copy"><h4>Base color</h4><p>Choose the foundation color mode for the interface.</p></div><label className="settings-select-wrap"><span className="sr-only">Base color</span><select className="settings-select" onChange={(event) => props.onBaseColorModeChange(event.target.value as BaseColorMode)} value={props.baseColorMode}><option value="light">Light</option></select></label></div>
        <div className="settings-row"><div className="settings-row-copy"><h4>Accent color</h4><p>Choose accent color for selected states, links, and quote rendering.</p></div><div className="settings-accent-controls"><button aria-label="Reset accent color" className="settings-reset" disabled={props.safeAccentColor === DEFAULT_ACCENT_COLOR_PRESET} onClick={props.onAccentColorPresetReset} type="button">↺</button><button aria-label="Pick accent color" className="settings-accent-trigger" onClick={props.onOpenAccentColorPicker} type="button"><span aria-hidden="true" className="settings-accent-swatch" style={{ backgroundColor: props.safeAccentColor }} /></button><input aria-label="Accent color picker" className="settings-accent-native-input" onChange={(event) => props.onAccentColorPresetChange(event.target.value as AccentColorPreset)} ref={props.accentColorInputRef} type="color" value={props.safeAccentColor} /></div></div>
        <div className="settings-row settings-row-readonly"><div className="settings-row-copy"><h4>Theme</h4><p>Theme package management will be added in a follow-up task.</p></div><span className="settings-pill">Planned</span></div>
      </section>
      <FontSection {...props} />
    </>
  );
}

function FontSection(props: {
  selectedUiFontValue: string;
  selectedInterfaceFontValue: string;
  selectedMonospaceFontValue: string;
  uiFontOptions: string[];
  interfaceFontOptions: string[];
  monospaceFontOptions: string[];
  areFontOptionsReady: boolean;
  interfaceFontSize: number;
  onUiFontSelectionChange: (value: string) => void;
  onInterfaceFontSelectionChange: (value: string) => void;
  onMonospaceFontSelectionChange: (value: string) => void;
  onInterfaceFontSizeChange: (value: number) => void;
  onInterfaceFontSizeReset: () => void;
}) {
  return <section aria-label="Appearance fonts section" className="settings-group">
    <h3 className="settings-group-title">Fonts</h3>
    <div className="settings-row"><div className="settings-row-copy"><h4>Interface font</h4><p>Font used for app chrome and UI controls.</p></div><label className="settings-select-wrap"><span className="sr-only">Interface font</span><select className="settings-select" disabled={!props.areFontOptionsReady} onChange={(event) => props.onUiFontSelectionChange(event.target.value)} value={props.selectedUiFontValue}>{INTERFACE_PRESET_OPTION_VALUES.map((preset) => <option key={preset} value={`ui-preset:${preset}`}>{presetLabel(preset)}</option>)}{props.uiFontOptions.map((font) => <option key={font} value={`ui-font:${font}`}>{font}</option>)}</select></label></div>
    <div className="settings-row"><div className="settings-row-copy"><h4>Text font</h4><p>Font used in main content text.</p></div><label className="settings-select-wrap"><span className="sr-only">Text font</span><select className="settings-select" disabled={!props.areFontOptionsReady} onChange={(event) => props.onInterfaceFontSelectionChange(event.target.value)} value={props.selectedInterfaceFontValue}>{INTERFACE_PRESET_OPTION_VALUES.map((preset) => <option key={preset} value={`preset:${preset}`}>{presetLabel(preset)}</option>)}{props.interfaceFontOptions.map((font) => <option key={font} value={`font:${font}`}>{font}</option>)}</select></label></div>
    <div className="settings-row"><div className="settings-row-copy"><h4>Monospace font</h4><p>Code font in fenced blocks and inline code. Monospaced fonts are listed first.</p></div><label className="settings-select-wrap"><span className="sr-only">Monospace font preset</span><select className="settings-select" disabled={!props.areFontOptionsReady} onChange={(event) => props.onMonospaceFontSelectionChange(event.target.value)} value={props.selectedMonospaceFontValue}>{MONOSPACE_PRESET_OPTION_VALUES.map((preset) => <option key={preset} value={`mono-preset:${preset}`}>{monospacePresetLabel(preset)}</option>)}{props.monospaceFontOptions.map((font) => <option key={font} value={`mono-font:${font}`}>{font}</option>)}</select></label></div>
    <div className="settings-row"><div className="settings-row-copy"><h4>Font size</h4><p>Adjust main content panel font size in pixels.</p></div><div className="settings-slider-wrap"><button aria-label="Reset font size" className="settings-reset" onClick={props.onInterfaceFontSizeReset} type="button">↺</button><input aria-label="Interface font size" className="settings-range" max={INTERFACE_FONT_SIZE_MAX} min={INTERFACE_FONT_SIZE_MIN} onChange={(event) => props.onInterfaceFontSizeChange(Number(event.target.value))} step={1} type="range" value={props.interfaceFontSize} /><span className="settings-range-value">{props.interfaceFontSize}px</span></div></div>
  </section>;
}
