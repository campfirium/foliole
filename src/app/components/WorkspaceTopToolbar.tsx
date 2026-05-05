import type { CSSProperties } from 'react';

import { AppToolbar } from '../../shared/ui';

interface WorkspaceTopToolbarProps {
  listWidth: number;
}

export function WorkspaceTopToolbar({ listWidth }: WorkspaceTopToolbarProps) {
  const dividerLeft = `calc(${listWidth}px + 2px)`;

  return (
    <AppToolbar
      aria-label="Workspace top toolbar"
      className="relative min-h-[38px] border-b border-border bg-bg-subtle px-3"
    >
      <div className="h-full flex-1" />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 w-px bg-border max-[1080px]:hidden"
        style={{ left: dividerLeft } as CSSProperties}
      />
    </AppToolbar>
  );
}
