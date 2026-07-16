import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { InterfaceFontPreset, MonospaceFontPreset } from '../model/appearanceSettings';
import { listAvailableSystemFonts } from '../model/systemFonts';

function useLazySystemFontCatalog() {
  const [fonts, setFonts] = useState<string[]>([]);
  const [monospaceFonts, setMonospaceFonts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const request = useCallback(() => {
    if (requestRef.current) {
      return;
    }
    setLoading(true);
    requestRef.current = listAvailableSystemFonts()
      .then((catalog) => {
        if (mountedRef.current) {
          setFonts(catalog.fonts);
          setMonospaceFonts(catalog.monospaceFonts);
        }
      })
      .catch(() => undefined)
      .finally(() => mountedRef.current && setLoading(false));
  }, []);

  return { fonts, loading, monospaceFonts, request };
}

export function useSettingsFontOptions(props: {
  customInterfaceFont: string;
  customMonospaceFont: string;
  interfaceFontPreset: InterfaceFontPreset;
  monospaceFontPreset: MonospaceFontPreset;
}) {
  const catalog = useLazySystemFontCatalog();

  const allFontOptions = useMemo(
    () =>
      [...new Set([...catalog.fonts, ...catalog.monospaceFonts, props.customInterfaceFont, props.customMonospaceFont].filter(Boolean))].sort((l, r) =>
        l.localeCompare(r)
      ),
    [catalog.fonts, catalog.monospaceFonts, props.customInterfaceFont, props.customMonospaceFont]
  );
  const monospaceFontOptions = useMemo(() => {
    const mono = new Set(catalog.monospaceFonts);
    return [...allFontOptions.filter((font) => mono.has(font)), ...allFontOptions.filter((font) => !mono.has(font))];
  }, [allFontOptions, catalog.monospaceFonts]);

  return {
    interfaceFontOptions: allFontOptions,
    isLoadingFontOptions: catalog.loading,
    monospaceFontOptions,
    requestFontOptions: catalog.request,
    selectedInterfaceFontValue:
      props.interfaceFontPreset === 'custom'
        ? (props.customInterfaceFont ? `font:${props.customInterfaceFont}` : 'preset:default')
        : `preset:${props.interfaceFontPreset}`,
    selectedMonospaceFontValue:
      props.monospaceFontPreset === 'custom'
        ? (props.customMonospaceFont ? `mono-font:${props.customMonospaceFont}` : 'mono-preset:default')
        : `mono-preset:${props.monospaceFontPreset}`,
  };
}
