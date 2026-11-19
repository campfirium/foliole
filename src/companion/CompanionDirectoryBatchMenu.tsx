import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';

type SelectAction = () => void;
type MenuEntry = {
  select: SelectAction | null;
  register(select: SelectAction): () => void;
  selectionActive: boolean;
  setSelectionActive(active: boolean): void;
};
const BatchMenu = createContext<MenuEntry | null>(null);

export function CompanionDirectoryBatchMenuProvider({ children }: { children: ReactNode }) {
  const [selectionActive, setSelectionActive] = useState(false);
  const [select, setSelect] = useState<SelectAction | null>(null);
  const register = useCallback((action: SelectAction) => {
    setSelect(() => action);
    return () => setSelect(current => current === action ? null : current);
  }, []);
  return <BatchMenu.Provider value={{ select, register, selectionActive, setSelectionActive }}>{children}</BatchMenu.Provider>;
}

export function useCompanionDirectoryBatchMenuAction() {
  return useContext(BatchMenu)?.select ?? null;
}

export function useRegisterCompanionDirectoryBatchMenuAction(select: SelectAction, available: boolean) {
  const register = useContext(BatchMenu)?.register;
  useEffect(() => available ? register?.(select) : undefined, [available, register, select]);
}

export function useCompanionDirectoryBatchActive() {
  return useContext(BatchMenu)?.selectionActive ?? false;
}

export function useCompanionDirectoryBatchHeader(active: boolean) {
  const setActive = useContext(BatchMenu)?.setSelectionActive;
  useLayoutEffect(() => {
    if (!active || !setActive) return;
    setActive(true);
    return () => setActive(false);
  }, [active, setActive]);
}
