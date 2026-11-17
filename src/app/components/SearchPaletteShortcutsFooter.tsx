import { useTranslation } from '../../shared/localization/LocalizationProvider';

import { WorkspaceResultShortcutsFooter } from './WorkspaceResultShortcutsFooter';

export function SearchPaletteShortcutsFooter() {
  const t = useTranslation();
  return (
    <WorkspaceResultShortcutsFooter
      preference="searchPaletteShortcutsCollapsed"
      collapseLabel={t('desktop.search.shortcuts.collapse')}
      showLabel={t('desktop.search.shortcuts.show')}
      hints={[
        { keys: ['Enter'], label: t('desktop.search.shortcuts.open') },
        { keys: ['Shift', 'Enter'], label: t('desktop.search.shortcuts.preview') },
        { keys: ['Shift', 'Click'], label: t('desktop.search.shortcuts.preview') }
      ]}
    />
  );
}
