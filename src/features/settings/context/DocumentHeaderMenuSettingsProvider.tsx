import { useCallback, useMemo, useState, type ReactNode } from 'react';

import {
  addDocumentHeaderMenuItem,
  loadDocumentHeaderMenuItems,
  moveDocumentHeaderMenuItem,
  removeDocumentHeaderMenuItem,
  resetDocumentHeaderMenuItems,
  saveDocumentHeaderMenuItems,
  toggleDocumentHeaderMenuItemSeparator,
  toggleDocumentHeaderMenuItemVisibility,
  type DocumentHeaderMenuItemConfig
} from '../model/documentHeaderMenuSettings';

import {
  DocumentHeaderMenuSettingsContext,
  useDocumentHeaderMenuSettings
} from './documentHeaderMenuSettingsContext';

function useDocumentHeaderMenuSettingsState() {
  const [items, setItems] = useState<DocumentHeaderMenuItemConfig[]>(() => loadDocumentHeaderMenuItems());

  const updateItems = useCallback((nextItems: DocumentHeaderMenuItemConfig[]) => {
    setItems(nextItems);
    saveDocumentHeaderMenuItems(nextItems);
  }, []);

  return {
    items,
    onAddMenuItem: useCallback(
      (command: { commandId: string; label: string }) => updateItems(addDocumentHeaderMenuItem(items, command)),
      [items, updateItems]
    ),
    onMoveMenuItem: useCallback(
      (itemId: string, order: number) => updateItems(moveDocumentHeaderMenuItem(items, itemId, order)),
      [items, updateItems]
    ),
    onRemoveMenuItem: useCallback(
      (itemId: string) => updateItems(removeDocumentHeaderMenuItem(items, itemId)),
      [items, updateItems]
    ),
    onResetMenu: useCallback(() => updateItems(resetDocumentHeaderMenuItems()), [updateItems]),
    onToggleMenuItem: useCallback(
      (itemId: string, visible: boolean) => updateItems(toggleDocumentHeaderMenuItemVisibility(items, itemId, visible)),
      [items, updateItems]
    ),
    onToggleMenuSeparator: useCallback(
      (itemId: string, separatorBefore: boolean) => updateItems(toggleDocumentHeaderMenuItemSeparator(items, itemId, separatorBefore)),
      [items, updateItems]
    )
  };
}

export function DocumentHeaderMenuSettingsProvider({ children }: { children: ReactNode }) {
  const state = useDocumentHeaderMenuSettingsState();
  const value = useMemo(
    () => ({
      items: state.items,
      onAddMenuItem: state.onAddMenuItem,
      onMoveMenuItem: state.onMoveMenuItem,
      onRemoveMenuItem: state.onRemoveMenuItem,
      onResetMenu: state.onResetMenu,
      onToggleMenuItem: state.onToggleMenuItem,
      onToggleMenuSeparator: state.onToggleMenuSeparator
    }),
    [
      state.items,
      state.onAddMenuItem,
      state.onMoveMenuItem,
      state.onRemoveMenuItem,
      state.onResetMenu,
      state.onToggleMenuItem,
      state.onToggleMenuSeparator
    ]
  );

  return (
    <DocumentHeaderMenuSettingsContext.Provider value={value}>
      {children}
    </DocumentHeaderMenuSettingsContext.Provider>
  );
}

export { useDocumentHeaderMenuSettings };
