import { useEffect, useRef, useState } from 'react';

import {
  activateReadingFont, commitReadingFonts, listReadingFonts, prepareReadingFonts, removeReadingFont,
  type CompanionReadingFont, type ReadingFontImport
} from './companionReadingFonts';
import type { CompanionReadingTypographySettings } from './companionReadingTypographySettings';

export interface CustomFontProps {
  onChange(settings: CompanionReadingTypographySettings): boolean | void;
  settings: CompanionReadingTypographySettings;
}

function useFontList(setError: (error: 'actionError') => void) {
  const [fonts, setFonts] = useState<CompanionReadingFont[]>([]);
  useEffect(() => {
    let active = true;
    void listReadingFonts().then(items => { if (active) setFonts(items); })
      .catch(() => { if (active) setError('actionError'); });
    return () => { active = false; };
  }, []);
  return [fonts, setFonts] as const;
}

export function useReadingCustomFonts(props: CustomFontProps) {
  const [error, setError] = useState<'importError' | 'actionError' | null>(null);
  const [fonts, setFonts] = useFontList(setError);
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<ReadingFontImport | null>(null);
  const current = useRef(props);
  current.current = props;


  async function selectFont(id: string) {
    setBusy(true);
    setError(null);
    try {
      if (!await activateReadingFont(id)) throw new Error('Font is missing');
      const { settings, onChange } = current.current;
      if (onChange({ ...settings, fontFamily: `custom:${id}` }) === false) throw new Error('Could not save selection');
    } catch { setError('actionError'); }
    finally { setBusy(false); }
  }

  async function prepareFiles(files: File[], targetId?: string) {
    if (!files.length) return;
    setBusy(true);
    setError(null);
    try { setPrepared(await prepareReadingFonts(files, targetId)); }
    catch { setError('importError'); }
    finally { setBusy(false); }
  }

  async function confirmImport() {
    if (!prepared) return;
    setBusy(true);
    setError(null);
    try {
      const imported = await commitReadingFonts(prepared);
      setFonts(await listReadingFonts());
      setPrepared(null);
      if (imported.length === 1) {
        const { settings, onChange } = current.current;
        if (onChange({ ...settings, fontFamily: `custom:${imported[0]!.id}` }) === false) setError('actionError');
      }
    } catch { setError('importError'); }
    finally { setBusy(false); }
  }

  async function removeFont(id: string, faceId?: string) {
    setBusy(true);
    setError(null);
    const before = current.current.settings;
    const family = fonts.find(font => font.id === id);
    const reset = before.fontFamily === `custom:${id}` && (!faceId || family?.faces.length === 1);
    try {
      if (reset && current.current.onChange({ ...before, fontFamily: 'sans' }) === false) {
        throw new Error('Could not save selection');
      }
      await removeReadingFont(id, faceId);
      setFonts(await listReadingFonts());
    } catch {
      if (reset && current.current.settings.fontFamily === 'sans') current.current.onChange(before);
      setError('actionError');
    } finally { setBusy(false); }
  }

  return { fonts, error, busy, prepared, prepareFiles, confirmImport, selectFont, removeFont,
    cancelImport: () => setPrepared(null) };
}
