import { useEffect, useMemo, useState } from 'react';

import { useHotkeySettings } from '../../features/settings/context/HotkeySettingsProvider';
import type { SettingsSearchResult } from '../../features/settings/model/settingsSearch';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { buildCommandMenuSections } from '../../shared/commands/menuModel';
import type { CommandPaletteItem } from '../../shared/commands/types';
import { useTranslation } from '../../shared/localization/LocalizationProvider';

import { buildPaletteActionHelpSection } from './commandPaletteActionHelp';
import { CommandPaletteList, type PaletteResult } from './CommandPaletteList';
import { FloatingPaletteInput } from './FloatingPaletteInput';
import { useFloatingDialogFocusTrap } from './useFloatingDialogFocusTrap';
import { useFloatingPaletteEscape } from './useFloatingPaletteEscape';
import { usePaletteSettingsSection } from './usePaletteSettingsSection';
import { WorkspacePaletteFrame, workspacePaletteOverlayClassName } from './WorkspacePaletteFrame';
import { WorkspaceResultHeader, workspaceResultInputClassName } from './WorkspaceResultPalette';

const EMPTY_COMMAND_ITEMS: CommandPaletteItem[] = [];
const EMPTY_RECENT_COMMAND_IDS: string[] = [];

interface CommandPaletteProps {
  isOpen: boolean;
  items: CommandPaletteItem[];
  recentCommandIds: string[];
  onClose: () => void;
  onOpenSetting?: (result: SettingsSearchResult) => void;
  onRunCommand: (id: string) => void;
}

function useCommandPaletteSections(args: CommandPaletteProps, query: string) {
  const t = useTranslation();
  const recentTitle = t('desktop.command.section.recent');
  const visibleItemsSource = args.isOpen ? args.items : EMPTY_COMMAND_ITEMS;
  const visibleRecentCommandIds = args.isOpen ? args.recentCommandIds : EMPTY_RECENT_COMMAND_IDS;
  const searchableQuery = args.isOpen ? query : '';
  const actionHelpSection = useMemo(
    () => buildPaletteActionHelpSection(searchableQuery, t),
    [searchableQuery, t]
  );
  const sections = useMemo(
    () =>
      buildCommandMenuSections(visibleItemsSource, visibleRecentCommandIds, searchableQuery, {
        recentTitle
      }),
    [visibleItemsSource, recentTitle, searchableQuery, visibleRecentCommandIds]
  );
  const settingsSection = usePaletteSettingsSection(args.onOpenSetting ? searchableQuery : '');
  const resultSections = [...sections];
  if (settingsSection) resultSections.push(settingsSection);
  if (actionHelpSection) resultSections.push(actionHelpSection);
  return resultSections;
}

function useCommandPaletteState(args: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [expandedTipId, setExpandedTipId] = useState<string | null>(null);
  const displaySections = useCommandPaletteSections(args, query);
  const activeItems = displaySections.flatMap((section) => section.items).filter((item) => item.enabled);

  useEffect(() => {
    if (!args.isOpen) {
      setQuery('');
      setExpandedTipId(null);
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
  }, [activeIndex, activeItems.length]);

  const runItem = (item: PaletteResult | undefined) => {
    if (!item?.enabled) return;
    if (item.setting) args.onOpenSetting?.(item.setting);
    else if (item.tip) {
      setActiveIndex(activeItems.findIndex(({ id }) => id === item.id));
      setExpandedTipId((current) => current === item.id ? null : item.id);
    } else args.onRunCommand(item.id);
  };

  const updateQuery = (value: string) => {
    setActiveIndex(0);
    setExpandedTipId(null);
    setQuery(value);
  };

  return { activeIndex, activeItems, displaySections, expandedTipId, query, runItem, setActiveIndex, updateQuery };
}

export function CommandPalette(props: CommandPaletteProps) {
  const { isOpen, onClose, onRunCommand } = props;
  const t = useTranslation();
  const hotkeys = useHotkeySettings();
  const focusTrap = useFloatingDialogFocusTrap(isOpen);
  useFloatingPaletteEscape(isOpen, onClose);
  const state = useCommandPaletteState(props);

  if (!isOpen) return null;

  return (
    <div
      aria-label={t('desktop.palette.command.dialog')}
      aria-modal="true"
      className={workspacePaletteOverlayClassName}
      onClick={onClose}
      role="dialog"
    >
      <WorkspacePaletteFrame
        onKeyDown={focusTrap.handleKeyDown}
        onClick={(event) => event.stopPropagation()}
        ref={focusTrap.containerRef}
      >
        <WorkspaceResultHeader>
          <FloatingPaletteInput
            className={workspaceResultInputClassName}
            inputLabel={t('desktop.palette.command.search')}
            onClose={onClose}
            onQueryChange={state.updateQuery}
            onRunActive={(event) => {
              if (!event.nativeEvent.isComposing) state.runItem(state.activeItems[state.activeIndex]);
            }}
            onSetActiveIndex={state.setActiveIndex}
            placeholder={t('desktop.palette.command.placeholder')}
            query={state.query}
            totalItems={state.activeItems.length}
          />
        </WorkspaceResultHeader>
        <CommandPaletteList
          activeIndex={state.activeIndex}
          activeItems={state.activeItems}
          displaySections={state.displaySections}
          emptyLabel={t('desktop.palette.command.empty')}
          expandedTipId={state.expandedTipId}
          onConfigureItem={(item) => {
            hotkeys.onConfigureShortcut(item.id);
            onRunCommand(APP_COMMAND_IDS.openSettings);
          }}
          onRunItem={state.runItem}
        />
      </WorkspacePaletteFrame>
    </div>
  );
}
