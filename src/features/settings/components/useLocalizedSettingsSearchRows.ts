import { useMemo } from 'react';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import type { SettingsSearchRowMeta } from '../model/settingsSearch';
import { createSettingsSearchRows } from '../model/settingsSearchRowCatalog';

function useLocalizedSettingsSearchRows() {
  const t = useTranslation();
  return useMemo(() => createSettingsSearchRows(t), [t]);
}

export function useLocalizedSettingsSearchRow(id: string): SettingsSearchRowMeta {
  const rows = useLocalizedSettingsSearchRows();
  const row = rows.find((item) => item.id === id);
  if (!row) {
    throw new Error(`Settings search row is missing: ${id}`);
  }
  return row;
}
