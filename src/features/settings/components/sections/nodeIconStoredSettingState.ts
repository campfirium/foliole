import { useState } from 'react';

import {
  getWhitelistedLocalStorageItem,
  removeWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../../../../shared/platform/storage';

function saveOptionalString(key: string, value: string) {
  if (value.trim().length === 0) {
    removeWhitelistedLocalStorageItem(key);
    return;
  }
  setWhitelistedLocalStorageItem(key, value);
}

export function useStoredSvgSetting(key: string) {
  const [value, setValue] = useState(() => getWhitelistedLocalStorageItem(key) ?? '');
  return {
    set(nextValue: string) {
      setValue(nextValue);
      saveOptionalString(key, nextValue);
    },
    value
  };
}

export function useStoredIconSetting(key: string) {
  const [value, setValue] = useState(() => getWhitelistedLocalStorageItem(key) ?? '');
  return {
    set(nextValue: string) {
      setValue(nextValue);
      saveOptionalString(key, nextValue);
    },
    value
  };
}
