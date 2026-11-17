import { useSettingsSearchIndex } from '../../features/settings/components/useSettingsSearch';
import { querySettingsSearch } from '../../features/settings/model/settingsSearch';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { useDemoRuntimeState } from '../../shared/platform/runtime/demoRuntime';

import type { PaletteSection } from './CommandPaletteList';

export function usePaletteSettingsSection(query: string): PaletteSection | null {
  const t = useTranslation();
  const { isDemo } = useDemoRuntimeState();
  const { categories, rows } = useSettingsSearchIndex(isDemo);
  const labels = new Map(categories.map(({ id, label }) => [id, label]));
  const results = querySettingsSearch(categories, rows, query).filter((result) => labels.has(result.categoryId));
  if (!results.length) return null;

  return {
    id: 'settings-results',
    title: t('settings.title'),
    items: results.map((setting) => ({
      id: `setting:${setting.id}`,
      title: setting.title,
      enabled: true,
      setting,
      subtitle: setting.rowId ? labels.get(setting.categoryId) ?? '' : ''
    }))
  };
}
