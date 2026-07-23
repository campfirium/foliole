import { useEffect, useMemo, useState } from 'react';

import { useHotkeySettings } from '../../features/settings/context/HotkeySettingsProvider';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { buildCommandMenuSections } from '../../shared/commands/menuModel';
import type { CommandPaletteItem } from '../../shared/commands/types';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  appFloatingOverlayClassName,
  appFloatingSurfaceClassName
} from '../../shared/ui';

import { CommandPaletteList } from './CommandPaletteList';
import { FloatingPaletteInput } from './FloatingPaletteInput';
import { useFloatingDialogFocusTrap } from './useFloatingDialogFocusTrap';
import { useFloatingPaletteEscape } from './useFloatingPaletteEscape';

const EMPTY_COMMAND_ITEMS: CommandPaletteItem[] = [];
const EMPTY_RECENT_COMMAND_IDS: string[] = [];

interface CommandPaletteProps {
  isOpen: boolean;
  items: CommandPaletteItem[];
  recentCommandIds: string[];
  onClose: () => void;
  onRunCommand: (id: string) => void;
}

function runItem(onRunCommand: (id: string) => void, item: CommandPaletteItem | undefined) {
  if (!item || !item.enabled) {
    return;
  }
  onRunCommand(item.id);
}

function useCommandPaletteState(
  args: Pick<CommandPaletteProps, 'isOpen' | 'items' | 'recentCommandIds'> & { recentTitle: string }
) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const visibleItemsSource = args.isOpen ? args.items : EMPTY_COMMAND_ITEMS;
  const visibleRecentCommandIds = args.isOpen ? args.recentCommandIds : EMPTY_RECENT_COMMAND_IDS;
  const sections = useMemo(
    () =>
      buildCommandMenuSections(visibleItemsSource, visibleRecentCommandIds, query, {
        recentTitle: args.recentTitle
      }),
    [args.recentTitle, query, visibleItemsSource, visibleRecentCommandIds]
  );
  const displaySections = sections;
  const activeItems = useMemo(
    () => displaySections.flatMap((section) => section.items).filter((item) => item.enabled),
    [displaySections]
  );

  useEffect(() => {
    if (!args.isOpen) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [args.isOpen]);

  useEffect(() => {
    if (!activeItems.length) {
      setActiveIndex(0);
      return;
    }
    if (activeIndex >= activeItems.length) {
      setActiveIndex(activeItems.length - 1);
    }
  }, [activeIndex, activeItems]);

  return {
    activeIndex,
    activeItems,
    displaySections,
    query,
    setActiveIndex,
    setQuery
  };
}

export function CommandPalette({
  isOpen,
  items,
  recentCommandIds,
  onClose,
  onRunCommand
}: CommandPaletteProps) {
  const t = useTranslation();
  const hotkeys = useHotkeySettings();
  const focusTrap = useFloatingDialogFocusTrap(isOpen);
  useFloatingPaletteEscape(isOpen, onClose);
  const { activeIndex, activeItems, displaySections, query, setActiveIndex, setQuery } =
    useCommandPaletteState({
      isOpen,
      items,
      recentCommandIds,
      recentTitle: t('desktop.command.section.recent')
    });

  if (!isOpen) {
    return null;
  }

  return (
    <div
      aria-label={t('desktop.palette.command.dialog')}
      aria-modal="true"
      className={appFloatingOverlayClassName()}
      onClick={onClose}
      role="dialog"
    >
      <div
        className={appFloatingSurfaceClassName('panel', 'w-full max-w-xl overflow-hidden')}
        onKeyDown={focusTrap.handleKeyDown}
        onClick={(event) => event.stopPropagation()}
        ref={focusTrap.containerRef}
      >
        <FloatingPaletteInput
          inputLabel={t('desktop.palette.command.search')}
          onClose={onClose}
          onQueryChange={setQuery}
          onRunActive={() => runItem(onRunCommand, activeItems[activeIndex])}
          onSetActiveIndex={setActiveIndex}
          placeholder={t('desktop.palette.command.placeholder')}
          query={query}
          totalItems={activeItems.length}
        />
        <CommandPaletteList
          activeIndex={activeIndex}
          activeItems={activeItems}
          displaySections={displaySections}
          emptyLabel={t('desktop.palette.command.empty')}
          onConfigureItem={(item) => {
            hotkeys.onConfigureShortcut(item.id);
            onRunCommand(APP_COMMAND_IDS.openSettings);
          }}
          onRunItem={(item) => runItem(onRunCommand, item)}
        />
      </div>
    </div>
  );
}
