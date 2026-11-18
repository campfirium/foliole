import { useState } from 'react';

type Tab = 'converted' | 'skipped' | 'missing';

export function useSuperMemoPreviewNavigation(source: object | undefined) {
  const [state, setState] = useState<{ source: object | undefined; tab: Tab; active?: number | undefined; branches: Record<number, boolean> }>();
  const current = state?.source === source && state ? state : { source, tab: 'converted' as const, active: undefined, branches: {} };
  return {
    ...current,
    selectTab: (tab: Tab) => setState({ ...current, tab, active: undefined }),
    selectEntry: (active: number) => setState({ ...current, active }),
    toggleBranch: (id: number, open: boolean) => setState({ ...current, branches: { ...current.branches, [id]: open } })
  };
}
