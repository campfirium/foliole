import { useState, useSyncExternalStore } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { getDevanagariSelectionMode, setDevanagariSelectionMode } from '../shared/platform/supportLog/androidDevanagariSelectionMode';
import { getSupportLogState, subscribeSupportLog } from '../shared/platform/supportLog/supportLog';

export function CompanionDevanagariSelectionControl() {
  const t = useTranslation();
  const [mode, setMode] = useState(getDevanagariSelectionMode);
  const recording = useSyncExternalStore(subscribeSupportLog, getSupportLogState).phase === 'recording';
  if (!mode) return null;
  return (
    <label className="mx-4 flex min-h-11 items-center justify-between gap-3 py-2 text-sm">
      <span>{t('companion.settings.devanagariSelection.label')}</span>
      <select className="min-h-11 rounded border border-companion-divider bg-transparent px-2"
        disabled={recording} value={mode} onChange={event => {
          const next = event.target.value === 'off' ? 'off' : 'annotation';
          setDevanagariSelectionMode(next);
          setMode(next);
        }}>
        <option value="annotation">{t('companion.settings.devanagariSelection.annotation')}</option>
        <option value="off">{t('companion.settings.devanagariSelection.off')}</option>
      </select>
    </label>
  );
}
