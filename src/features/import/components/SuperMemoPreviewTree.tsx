import { ChevronDown, ChevronRight, Folder } from 'lucide-react';

import { SUPER_MEMO_IMPORT_FOLDER_TITLE } from '../../../../lib/core/import/superMemoImportParents';
import type { NativeSuperMemoPreviewRow as Row } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';

interface TreeProps {
  childrenByParent: ReadonlyMap<number | null, readonly Row[]>;
  parent: number | null;
  depth?: number;
  branches: Readonly<Partial<Record<number, boolean>>>;
  toggleBranch(id: number, open: boolean): void;
  active: number | undefined;
  onSelect(id: number): void;
}

export function SuperMemoEntryButton({ row, active, onSelect }: {
  row: Row; active: number | undefined; onSelect(id: number): void;
}) {
  return (
    <button type="button" aria-current={active === row.id}
      onClick={() => onSelect(row.id)}
      title={row.title || `#${row.id}`}
      className="min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left hover:bg-foreground/5 aria-[current=true]:bg-foreground/10">
      {row.outcome === 'folder' ? <Folder aria-hidden className="mr-1.5 inline size-3.5 align-text-bottom" /> : null}
      {row.title || `#${row.id}`}{row.title ? <span className="ml-1 whitespace-nowrap text-xs text-foreground/65">#{row.id}</span> : null}
    </button>
  );
}

function Branch({ row, ...tree }: TreeProps & { row: Row }) {
  const t = useTranslation();
  const depth = tree.depth ?? 0;
  const open = tree.branches[row.id] ?? depth < 2;
  const childRows = tree.childrenByParent.get(row.id);
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <li>
      <div className="flex min-w-0 items-center">
        {childRows?.length ? (
          <button type="button" aria-expanded={open}
            aria-label={t(open ? 'desktop.superMemoDrafts.collapseEntry' : 'desktop.superMemoDrafts.expandEntry', { id: row.id })}
            onClick={() => tree.toggleBranch(row.id, !open)}
            className="flex size-6 shrink-0 items-center justify-center rounded hover:bg-foreground/5">
            <Icon aria-hidden className="size-3.5" />
          </button>
        ) : <span className="w-6 shrink-0" />}
        <SuperMemoEntryButton row={row} active={tree.active} onSelect={tree.onSelect} />
      </div>
      {open && childRows?.length ? <SuperMemoPreviewTree {...tree} parent={row.id} depth={depth + 1} /> : null}
    </li>
  );
}

export function SuperMemoPreviewTree(props: TreeProps) {
  const depth = props.depth ?? 0;
  return (
    <ul className={depth ? 'ml-3 border-l border-foreground/10 pl-1' : undefined}>
      {props.childrenByParent.get(props.parent)?.map(row => <Branch {...props} key={row.id} row={row} />)}
    </ul>
  );
}

export function SuperMemoPreviewDestination(props: Omit<TreeProps, 'parent' | 'depth'>) {
  return (
    <div>
      <div className="flex items-center gap-2 px-2 py-1 font-medium">
        <Folder aria-hidden className="size-3.5" />
        {SUPER_MEMO_IMPORT_FOLDER_TITLE}
      </div>
      <div className="ml-3 border-l border-foreground/10 pl-1">
        <SuperMemoPreviewTree {...props} parent={null} />
      </div>
    </div>
  );
}
