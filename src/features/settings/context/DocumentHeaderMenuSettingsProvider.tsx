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
  DEFAULT_EDITOR_CONTEXT_MENU_ITEMS,
  loadEditorContextMenuItems,
  resetEditorContextMenuItems,
  saveEditorContextMenuItems
} from '../model/editorContextMenuSettings';

import {
  DocumentHeaderMenuSettingsContext,
  useDocumentHeaderMenuSettings
} from './documentHeaderMenuSettingsContext';

function useDocumentHeaderMenuSettingsState() {
  const [items, setItems] = useState<DocumentHeaderMenuItemConfig[]>(() => loadDocumentHeaderMenuItems());
  const [contextItems, setContextItems] = useState<DocumentHeaderMenuItemConfig[]>(() => loadEditorContextMenuItems());

  const updateItems = useCallback((nextItems: DocumentHeaderMenuItemConfig[]) => {
    setItems(nextItems);
    saveDocumentHeaderMenuItems(nextItems);
  }, []);
  const updateContextItems = useCallback((nextItems: DocumentHeaderMenuItemConfig[]) => {
    setContextItems(nextItems);
    saveEditorContextMenuItems(nextItems);
  }, []);

  return {
    items,
    contextItems,
    onAddContextItem: useCallback(
      (command: { commandId: string; label: string }) => updateContextItems(addDocumentHeaderMenuItem(contextItems, command, DEFAULT_EDITOR_CONTEXT_MENU_ITEMS)),
      [contextItems, updateContextItems]
    ),
    onMoveContextItem: useCallback(
      (itemId: string, order: number) => updateContextItems(moveDocumentHeaderMenuItem(contextItems, itemId, order, DEFAULT_EDITOR_CONTEXT_MENU_ITEMS)),
      [contextItems, updateContextItems]
    ),
    onRemoveContextItem: useCallback(
      (itemId: string) => updateContextItems(removeDocumentHeaderMenuItem(contextItems, itemId, DEFAULT_EDITOR_CONTEXT_MENU_ITEMS)),
      [contextItems, updateContextItems]
    ),
    onResetContextMenu: useCallback(() => updateContextItems(resetEditorContextMenuItems()), [updateContextItems]),
    onToggleContextItem: useCallback(
      (itemId: string, visible: boolean) => updateContextItems(toggleDocumentHeaderMenuItemVisibility(contextItems, itemId, visible, DEFAULT_EDITOR_CONTEXT_MENU_ITEMS)),
      [contextItems, updateContextItems]
    ),
    onToggleContextSeparator: useCallback(
      (itemId: string, separatorBefore: boolean) => updateContextItems(toggleDocumentHeaderMenuItemSeparator(contextItems, itemId, separatorBefore, DEFAULT_EDITOR_CONTEXT_MENU_ITEMS)),
      [contextItems, updateContextItems]
    ),
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
      contextItems: state.contextItems,
      onAddContextItem: state.onAddContextItem,
      onMoveContextItem: state.onMoveContextItem,
      onRemoveContextItem: state.onRemoveContextItem,
      onResetContextMenu: state.onResetContextMenu,
      onToggleContextItem: state.onToggleContextItem,
      onToggleContextSeparator: state.onToggleContextSeparator,
      onAddMenuItem: state.onAddMenuItem,
      onMoveMenuItem: state.onMoveMenuItem,
      onRemoveMenuItem: state.onRemoveMenuItem,
      onResetMenu: state.onResetMenu,
      onToggleMenuItem: state.onToggleMenuItem,
      onToggleMenuSeparator: state.onToggleMenuSeparator
    }),
    [
      state.items,
      state.contextItems,
      state.onAddContextItem,
      state.onMoveContextItem,
      state.onRemoveContextItem,
      state.onResetContextMenu,
      state.onToggleContextItem,
      state.onToggleContextSeparator,
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
