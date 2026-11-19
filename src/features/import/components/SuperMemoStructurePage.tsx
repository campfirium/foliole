import { ChevronDown, ChevronRight, FileText, Folder } from 'lucide-react';
import { useMemo, useState } from 'react';

import { orderSuperMemoSourceRows } from '../../../../lib/core/import/superMemoImportParents';
import { isSuperMemoCollectionRoot, isSuperMemoFolderCandidate } from '../../../../lib/core/import/superMemoImportStructure';
import type { SuperMemoXmlBody, SuperMemoXmlDraftElement } from '../../../../lib/core/import/superMemoXmlDraft';
import type { NativeSuperMemoPreview as Preview, NativeSuperMemoPreviewRow as Row } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppSwitch } from '../../../shared/ui';

import type { useSuperMemoPreviewNavigation } from './SuperMemoEntryPreview';
import { SuperMemoStructureDocument } from './SuperMemoStructureDocument';

type Navigation = ReturnType<typeof useSuperMemoPreviewNavigation>;
const emptyChildren = new Map<number | null, Row[]>();
const tabs = ['converted', 'folders', 'skipped', 'missing'] as const;

function sourceTree(preview: Preview, elements: SuperMemoXmlDraftElement[]) {
  const rows = orderSuperMemoSourceRows(preview.rows);
  const wrapper = elements.find(isSuperMemoCollectionRoot)?.id;
  const byId = new Map(rows.map(row => [row.id, row]));
  const children = new Map<number | null, Row[]>();
  for (const row of rows) {
    const parent = row.parentId;
    const siblings = children.get(parent) ?? [];
    siblings.push(row);
    children.set(parent, siblings);
  }
  const folders = rows.filter(row => row.structure?.editable &&
    isSuperMemoFolderCandidate(row, Boolean(children.get(row.id)?.length), row.structure.sourceHasBody));
  const skipped = rows.filter(row => row.outcome === 'skipped');
  const missing = rows.filter(row => row.unresolvedImages?.length);
  const missingCount = missing.reduce((total, row) =>
    total + row.unresolvedImages!.reduce((count, image) => count + image.count, 0), 0);
  const expanded = new Set<number>();
  const descendants = new Map<number, number>();
  for (let index = rows.length - 1; index >= 0; index--) {
    const row = rows[index]!;
    if (row.parentId !== null) {
      if (row.outcome === 'folder' || expanded.has(row.id)) expanded.add(row.parentId);
      descendants.set(row.parentId, (descendants.get(row.parentId) ?? 0) + 1 + (descendants.get(row.id) ?? 0));
    }
  }
  return { byId, children, descendants, expanded, wrapper, folders, skipped, missing, missingCount };
}

type TreeProps = {
  children: ReadonlyMap<number | null, Row[]>;
  descendants: ReadonlyMap<number, number>;
  expanded: ReadonlySet<number>;
  navigation: Navigation;
  busy: boolean;
  readOnly: boolean;
  folders: ReadonlySet<number>;
  wrapper?: number | undefined;
  onChange(id: number, folder: boolean): void;
};

function StructureRow({ row, tree }: { row: Row; tree: TreeProps }) {
  const t = useTranslation();
  const { children, navigation, busy, readOnly, onChange } = tree;
  const open = navigation.branches[row.id] ?? (row.id === tree.wrapper || tree.expanded.has(row.id));
  const expandable = Boolean(children.get(row.id)?.length);
  const Chevron = open ? ChevronDown : ChevronRight;
  const Icon = row.outcome === 'folder' ? Folder : FileText;
  const isRoot = row.id === tree.wrapper;
  const title = row.sourceTitle || (isRoot ? t('desktop.superMemoDrafts.collectionRoot') : row.title || `#${row.id}`);
  const count = isRoot ? undefined : tree.descendants.get(row.id);
  const label = count ? `${title} (${count})` : title;
  const selected = navigation.active === row.id;
  return <li>
    <div className={`flex min-w-0 items-center gap-1 rounded-md pr-2 ${
      selected ? 'bg-[var(--role-selection-surface)]' : 'hover:bg-foreground/5'
    }`}>
      {expandable ? <button type="button" aria-expanded={open}
        aria-label={t(open ? 'desktop.superMemoDrafts.collapseEntry' : 'desktop.superMemoDrafts.expandEntry', { id: row.id })}
        onClick={() => navigation.toggleBranch(row.id, !open)} className="grid size-7 shrink-0 place-items-center rounded hover:bg-foreground/10">
        <Chevron aria-hidden className="size-4" />
      </button> : <span className="w-7 shrink-0" />}
      <button type="button" title={label} aria-current={selected ? 'true' : undefined}
        onClick={() => navigation.selectEntry(row.id)}
        aria-description={tree.folders.has(row.id) ? t('desktop.superMemoDrafts.folderCandidate') : undefined}
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1.5 text-left aria-[current=true]:font-medium">
        <Icon aria-hidden className="size-4 shrink-0" />
        <span className="truncate">{title}</span>
        {count ? <span className="shrink-0 text-xs text-foreground/65">({count})</span> : null}
        {row.sourceTitle || row.title || isRoot ? <span className="shrink-0 text-xs text-foreground/65">#{row.id}</span> : null}

      </button>
      {row.structure?.editable ? <AppSwitch compact disabled={busy || readOnly} checked={row.outcome === 'folder'}
        aria-label={t('desktop.superMemoDrafts.structureSwitch', { title, id: row.id })}
        onCheckedChange={folder => {
          if (folder && expandable) navigation.toggleBranch(row.id, true);
          onChange(row.id, folder);
        }} /> : null}
    </div>
    {open && expandable ? <ul className="ml-3 border-l border-settings-divider pl-1">
      {children.get(row.id)?.map(child => <StructureRow key={child.id} row={child} tree={tree} />)}
    </ul> : null}
  </li>;
}

export function SuperMemoStructurePage({ preview, elements, loaded, ...controls }: {
  preview: Preview; elements: SuperMemoXmlDraftElement[]; loaded: SuperMemoXmlBody[] | null | undefined;
} & Pick<TreeProps, 'navigation' | 'busy' | 'onChange'>) {
  const t = useTranslation();
  const { children, descendants, expanded, byId, wrapper, folders, skipped, missing, missingCount } = useMemo(() => sourceTree(preview, elements), [preview, elements]);
  const [openedFolders, setOpenedFolders] = useState(expanded);
  const defaultExpanded = new Set([...openedFolders, ...expanded]);
  if (defaultExpanded.size !== openedFolders.size) setOpenedFolders(defaultExpanded);
  const readOnly = Boolean(preview.directoryUpdate);
  const { tab, active, selectTab } = controls.navigation;
  const folderIds = useMemo(() => new Set(folders.map(row => row.id)), [folders]);
  const filters = { folders, skipped, missing };
  const filtered = tab === 'converted' ? undefined : filters[tab];
  const counts = { folders: folders.length, skipped: skipped.length, missing: missingCount };
  const current = byId.get(active ?? 0) ?? filtered?.[0];
  const content = useMemo(() => loaded ? new Map(loaded.map(element => [element.id, element])) :
    loaded === null ? 'unavailable' : 'loading', [loaded]);
  return <>
    {!preview.pairedCollection ? <p className="shrink-0 text-xs text-muted-foreground">{t('desktop.superMemoDrafts.structureXmlOrder')}</p> : null}
    <div className="grid min-h-48 flex-1 grid-cols-2 grid-rows-[auto_minmax(0,1fr)] overflow-hidden text-sm">
      <nav aria-label={t('desktop.superMemoDrafts.structureSource')}
        className="col-span-2 flex min-w-0 gap-5 overflow-x-auto border-b border-settings-divider [scrollbar-width:none]">
        {tabs.map(key => <button type="button" key={key} aria-pressed={tab === key}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent py-2 text-foreground/70 hover:text-foreground aria-pressed:border-[var(--role-accent)] aria-pressed:text-foreground"
          onClick={() => selectTab(key)}>
          {key === 'converted' ? t('desktop.superMemoDrafts.structureSource') : <>
            {t(`desktop.superMemoDrafts.structureFilters.${key}`)}{' '}
            <span className="tabular-nums text-xs text-foreground/65">{counts[key]}</span>
          </>}
        </button>)}
      </nav>
      <section aria-label={t('desktop.superMemoDrafts.structureSource')}
        className="app-scrollbar min-h-0 min-w-0 overflow-auto border-r border-settings-divider pr-3">
        <ul className="py-2">
          {(filtered ?? children.get(null))?.map(row => <StructureRow key={row.id} row={row}
            tree={{ ...controls, children: filtered ? emptyChildren : children, descendants, expanded: defaultExpanded, wrapper, readOnly, folders: folderIds }} />)}
        </ul>
      </section>
      <section key={current?.id} aria-label={t('desktop.superMemoDrafts.entryPreview')} className="app-scrollbar min-h-0 min-w-0 overflow-auto py-3 pl-5 pr-2">
        {current ? <SuperMemoStructureDocument row={current} content={content} /> :
          <p className="text-foreground/65">{t('desktop.superMemoDrafts.structureSelect')}</p>}
      </section>
    </div>
  </>;
}
