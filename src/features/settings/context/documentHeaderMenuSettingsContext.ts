import { createContext, useContext } from 'react';

import type { DocumentHeaderMenuItemConfig } from '../model/documentHeaderMenuSettings';

export interface DocumentHeaderMenuSettingsValue {
  items: DocumentHeaderMenuItemConfig[];
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
