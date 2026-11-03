import { useRef, useState } from 'react';

import type { EpubImportReleaseMode } from '../../lib/core/import/epub/epubReadingMode';

export interface CompanionEpubReadingModeChoice {
  fileName: string;
  apply(mode: EpubImportReleaseMode): Promise<unknown>;
}

export function useCompanionEpubReadingMode() {
  const [choice, setChoice] = useState<CompanionEpubReadingModeChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const saving = useRef(false);
  const select = async (mode: EpubImportReleaseMode) => {
    if (!choice || saving.current) return;
    saving.current = true; setBusy(true); setFailed(false);
    try { await choice.apply(mode); setChoice(null); }
    catch { setFailed(true); }
    finally { saving.current = false; setBusy(false); }
  };
  return { choice, busy, failed, select,
    offer: (next: CompanionEpubReadingModeChoice) => { setChoice(next); setFailed(false); },
    close: () => { if (!saving.current) { setChoice(null); setFailed(false); } } };
}
