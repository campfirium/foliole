import { useEffect, useMemo, useState } from 'react';

import type { InterfaceFontPreset, MonospaceFontPreset } from '../model/appearanceSettings';
import { listAvailableSystemFonts } from '../model/systemFonts';

export function useSettingsFontOptions(props: {
  customInterfaceFont: string;
  customMonospaceFont: string;
  customUiFont: string;
  interfaceFontPreset: InterfaceFontPreset;
  monospaceFontPreset: MonospaceFontPreset;
  uiFontPreset: InterfaceFontPreset;
}) {
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

  const allFontOptions = useMemo(
    () =>
      [...new Set([...availableSystemFonts, ...availableMonospaceFonts, props.customUiFont, props.customInterfaceFont, props.customMonospaceFont].filter(Boolean))].sort((l, r) =>
        l.localeCompare(r)
      ),
    [availableMonospaceFonts, availableSystemFonts, props.customInterfaceFont, props.customMonospaceFont, props.customUiFont]
  );
  const monospaceFontOptions = useMemo(() => {
    const mono = new Set(availableMonospaceFonts);
    return [...allFontOptions.filter((font) => mono.has(font)), ...allFontOptions.filter((font) => !mono.has(font))];
  }, [allFontOptions, availableMonospaceFonts]);

  return {
    areFontOptionsReady,
    interfaceFontOptions: allFontOptions,
    monospaceFontOptions,
    selectedInterfaceFontValue:
      props.interfaceFontPreset === 'custom'
        ? (props.customInterfaceFont ? `font:${props.customInterfaceFont}` : 'preset:default')
        : `preset:${props.interfaceFontPreset}`,
    selectedMonospaceFontValue:
      props.monospaceFontPreset === 'custom'
        ? (props.customMonospaceFont ? `mono-font:${props.customMonospaceFont}` : 'mono-preset:default')
        : `mono-preset:${props.monospaceFontPreset}`,
    selectedUiFontValue:
      props.uiFontPreset === 'custom'
        ? (props.customUiFont ? `ui-font:${props.customUiFont}` : 'ui-preset:default')
        : `ui-preset:${props.uiFontPreset}`,
    uiFontOptions: allFontOptions
  };
}
