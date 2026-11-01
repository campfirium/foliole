import { useCallback, useMemo, useRef, useState } from 'react';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, saveWhitelistedLocalStorageItem } from '../../../shared/platform/storage';
import { normalizeReadingFontWeight } from '../../../shared/typography/readingFontWeight';

const KEY = APP_SETTINGS_STORAGE_KEYS.readingFontWeight;

export function useReadingFontWeightSettings() {
  const [value, setValue] = useState(() => normalizeReadingFontWeight(getWhitelistedLocalStorageItem(KEY)));
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const serial = useRef(Promise.resolve());
  const request = useRef(0);
  const update = useCallback((input: number) => {
    const next = normalizeReadingFontWeight(input);
    const current = ++request.current;
    setValue(next);
    setSaving(true);
    serial.current = serial.current.then(async () => {
      const saved = await saveWhitelistedLocalStorageItem(KEY, String(next));
      if (request.current === current) {
        setSaveError(!saved);
        setSaving(false);
      }
    });
    return serial.current;
  }, []);
  return useMemo(() => ({ saveError, saving, update, value }), [saveError, saving, update, value]);
}

export type ReadingFontWeightSettings = ReturnType<typeof useReadingFontWeightSettings>;
