import { useRef, useState } from 'react';

import type { EpubImportReleaseMode } from '../../lib/core/import/epub/epubReadingMode';

export interface CompanionEpubReadingModeChoice {
  fileName: string;
  apply(mode: EpubImportReleaseMode): Promise<unknown>;
}

/** Asks for each imported book's reading mode in turn; a multi-file import can queue several books. */
export function useCompanionEpubReadingMode() {
  const [queue, setQueue] = useState<readonly CompanionEpubReadingModeChoice[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const saving = useRef(false);
  const choice = queue[0] ?? null;
  const advance = () => setQueue(current => current.slice(1));
  const select = async (mode: EpubImportReleaseMode) => {
    if (!choice || saving.current) return;
    saving.current = true; setBusy(true); setFailed(false);
    try { await choice.apply(mode); advance(); }
    catch { setFailed(true); }
    finally { saving.current = false; setBusy(false); }
  };
  return { choice, busy, failed, select,
    offer: (next: readonly CompanionEpubReadingModeChoice[]) => { setQueue(next); setFailed(false); },
    close: () => { if (!saving.current) { advance(); setFailed(false); } } };
}
