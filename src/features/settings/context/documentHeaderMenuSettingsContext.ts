import { createContext, useContext } from 'react';

import type { DocumentHeaderMenuItemConfig } from '../model/documentHeaderMenuSettings';

export interface DocumentHeaderMenuSettingsValue {
  items: DocumentHeaderMenuItemConfig[];
  contextItems: DocumentHeaderMenuItemConfig[];
  onAddContextItem: (command: { commandId: string; label: string }) => void;
  onMoveContextItem: (itemId: string, order: number) => void;
  onRemoveContextItem: (itemId: string) => void;
  onResetContextMenu: () => void;
  onToggleContextItem: (itemId: string, visible: boolean) => void;
  onToggleContextSeparator: (itemId: string, separatorBefore: boolean) => void;
  onAddMenuItem: (command: { commandId: string; label: string }) => void;
  onMoveMenuItem: (itemId: string, order: number) => void;
  onRemoveMenuItem: (itemId: string) => void;
  onResetMenu: () => void;
  onToggleMenuItem: (itemId: string, visible: boolean) => void;
  onToggleMenuSeparator: (itemId: string, separatorBefore: boolean) => void;
}

export const DocumentHeaderMenuSettingsContext = createContext<DocumentHeaderMenuSettingsValue | null>(null);

export function useDocumentHeaderMenuSettings() {
  const value = useContext(DocumentHeaderMenuSettingsContext);
  if (!value) {
    throw new Error('useDocumentHeaderMenuSettings must be used within DocumentHeaderMenuSettingsProvider');
  }
  return value;
}
