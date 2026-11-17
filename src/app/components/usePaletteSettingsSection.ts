import { useSettingsSearchIndex } from '../../features/settings/components/useSettingsSearch';
import { getSettingsCategories } from '../../features/settings/model/settingsPanelOptions';
import { querySettingsSearch } from '../../features/settings/model/settingsSearch';
import { createSettingsSearchRows } from '../../features/settings/model/settingsSearchRowCatalog';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { translate, type TranslationKey } from '../../shared/localization/translations';
import { useDemoRuntimeState } from '../../shared/platform/runtime/demoRuntime';

import type { PaletteSection } from './CommandPaletteList';

const english = (key: TranslationKey) => translate('en', key);
const englishRows = createSettingsSearchRows(english);

export function usePaletteSettingsSection(query: string): PaletteSection | null {
  const t = useTranslation();
  const { isDemo } = useDemoRuntimeState();
  const { categories, rows } = useSettingsSearchIndex(isDemo);
  if (!query.trim()) return null;

  const englishMatches = querySettingsSearch(getSettingsCategories(english), englishRows, query);
  const alternateMatches = new Set(englishMatches.map(({ id }) => id));
  const visibleCategories = new Set(categories.map(({ id }) => id));
  const results = querySettingsSearch(categories, rows, query, alternateMatches)
    .filter((result) => visibleCategories.has(result.categoryId));
  if (!results.length) return null;

  return {
    id: 'settings-results',
    title: t('settings.title'),
    items: results.map((setting) => ({
      id: `setting:${setting.id}`,
      title: setting.title,
      enabled: true,
      setting
    }))
  };
}
