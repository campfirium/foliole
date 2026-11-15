import { useState } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';

import { loadSearchPaletteShortcutsCollapsed, saveSearchPaletteShortcutsCollapsed } from './searchPaletteShortcutsPreference';
import { WorkspaceResultShortcutsFooter } from './WorkspaceResultShortcutsFooter';

export function useSearchPaletteShortcuts() {
  const [collapsed, setCollapsed] = useState(loadSearchPaletteShortcutsCollapsed);

  return {
    collapsed,
    toggle: () => {
      const nextCollapsed = !collapsed;
      setCollapsed(nextCollapsed);
      saveSearchPaletteShortcutsCollapsed(nextCollapsed);
    }
  };
}

export function SearchPaletteShortcutsFooter(props: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const t = useTranslation();
  return (
    <WorkspaceResultShortcutsFooter
      {...props}
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
