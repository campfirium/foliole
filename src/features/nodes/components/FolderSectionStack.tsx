import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { useFolderSectionSettings } from './folderSectionSettings';

interface SectionControl {
  hasExpandedBranches: boolean;
  setOverview: (overview: boolean) => void;
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
  const showOverview = sections.some((section) => section.hasExpandedBranches);
  return {
    hasCollapsibleNodes: sections.length > 0,
    hasCollapsedNodes: !showOverview,
    toggleAll: () => {
      for (const section of sections) {
        section.setOverview(showOverview);
      }
    }
  };
}

export function useFolderSectionControl(
  enabled: boolean,
  rootCollapsed: boolean,
  branchIds: readonly string[],
  collapsedIds: ReadonlySet<string>,
  setOverview: SectionControl['setOverview']
) {
  const register = useFolderSectionStack()?.register;
  const canToggle = enabled && (rootCollapsed || branchIds.length > 0);
  const hasExpandedBranches = !rootCollapsed && branchIds.some((id) => !collapsedIds.has(id));
  const setOverviewRef = useRef(setOverview);
  useLayoutEffect(() => {
    setOverviewRef.current = setOverview;
  }, [setOverview]);
  useLayoutEffect(() => {
    if (canToggle && register) {
      return register({ hasExpandedBranches, setOverview: (overview) => setOverviewRef.current(overview) });
    }
  }, [canToggle, hasExpandedBranches, register]);
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
