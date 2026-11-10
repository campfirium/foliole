import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { useFolderSectionSettings } from './folderSectionSettings';

interface SectionControl {
  collapsed: boolean;
  toggle: () => void;
}

interface FolderSectionContext {
  gap: number;
  controls: readonly SectionControl[];
  register: (control: SectionControl) => () => void;
}

const StackContext = createContext<FolderSectionContext | null>(null);

export function FolderSectionStack({ children }: { children: ReactNode }) {
  const settings = useFolderSectionSettings();
  const [controls, setControls] = useState<SectionControl[]>([]);
  const register = useCallback((control: SectionControl) => {
    setControls((current) => [...current, control]);
    return () => setControls((current) => current.filter((entry) => entry !== control));
  }, []);
  return <StackContext.Provider value={{ ...settings, controls, register }}>{children}</StackContext.Provider>;
}

export function useFolderSectionStack() {
  return useContext(StackContext);
}

export function useFolderSectionToolbar() {
  const sections = useFolderSectionStack()?.controls;
  if (!sections) return null;
  const hasCollapsedNodes = sections.some((section) => section.collapsed);
  return {
    hasCollapsibleNodes: sections.length > 0,
    hasCollapsedNodes,
    toggleAll: () => {
      for (const section of sections) {
        if (section.collapsed === hasCollapsedNodes) section.toggle();
      }
    }
  };
}

export function useFolderSectionControl(enabled: boolean, collapsed: boolean, toggle: () => void) {
  const register = useFolderSectionStack()?.register;
  const toggleRef = useRef(toggle);
  useLayoutEffect(() => {
    toggleRef.current = toggle;
  }, [toggle]);
  useLayoutEffect(() => {
    if (enabled && register) return register({ collapsed, toggle: () => toggleRef.current() });
  }, [collapsed, enabled, register]);
}

export function FolderSectionHeading(props: { children: ReactNode; first?: boolean }) {
  const stack = useFolderSectionStack();
  if (!stack) return props.children;
  return (
    <div className="folder-section-heading" style={{ paddingBlockStart: props.first ? 0 : stack.gap }}>
      {props.children}
    </div>
  );
}

export function FolderSectionRows({ rows }: { rows: ReactNode[] }) {
  if (rows.length === 0) return null;
  return (
    <>
      <FolderSectionHeading>{rows[0]}</FolderSectionHeading>
      {rows.slice(1)}
    </>
  );
}
