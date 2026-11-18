import { ChevronDown, ChevronRight, FileText, Folder } from 'lucide-react';
import { useMemo } from 'react';

import { convertSuperMemoContent } from '../../../../lib/core/import/superMemoContent';
import { orderSuperMemoSourceRows } from '../../../../lib/core/import/superMemoImportParents';
import { isSuperMemoCollectionRoot } from '../../../../lib/core/import/superMemoImportStructure';
import type { SuperMemoXmlDraftElement } from '../../../../lib/core/import/superMemoXmlDraft';
import type { NativeSuperMemoPreview as Preview, NativeSuperMemoPreviewRow as Row } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppSwitch } from '../../../shared/ui';
import { MarkdownEditor } from '../../editor/components/MarkdownEditor';

import type { useSuperMemoPreviewNavigation } from './SuperMemoEntryPreview';

type Navigation = ReturnType<typeof useSuperMemoPreviewNavigation>;
const emptyChildren = new Map<number | null, Row[]>();
const tabs = ['converted', 'skipped', 'missing'] as const;

const kindKey = {
  folder: 'desktop.superMemoDrafts.folder', topic: 'desktop.superMemoDrafts.topic',
  item: 'desktop.superMemoDrafts.item', skipped: 'desktop.superMemoDrafts.structureSkipped'
} as const;

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
  const skipped = rows.filter(row => row.outcome === 'skipped');
  const missing = rows.filter(row => row.unresolvedImages?.length);
  const missingCount = missing.reduce((total, row) =>
    total + row.unresolvedImages!.reduce((count, image) => count + image.count, 0), 0);
  const media = rows.reduce((total, row) => ({ local: total.local + (row.localImages ?? 0),
    remote: total.remote + (row.remoteImages ?? 0), audio: total.audio + (row.skippedAudio ?? 0) }),
  { local: 0, remote: 0, audio: 0 });
  const descendants = new Map<number, number>();
  for (let index = rows.length - 1; index >= 0; index--) {
    const row = rows[index]!;
    if (row.parentId !== null) {
      descendants.set(row.parentId, (descendants.get(row.parentId) ?? 0) + 1 + (descendants.get(row.id) ?? 0));
    }
  }
  return { byId, children, descendants, wrapper, skipped, missing, missingCount, media };
}

type TreeProps = {
  children: ReadonlyMap<number | null, Row[]>;
  descendants: ReadonlyMap<number, number>;
  navigation: Navigation;
  busy: boolean;
  readOnly: boolean;
  wrapper?: number | undefined;
  onChange(id: number, folder: boolean): void;
};

function StructureRow({ row, depth, tree }: { row: Row; depth: number; tree: TreeProps }) {
  const t = useTranslation();
  const { children, navigation, busy, readOnly, onChange } = tree;
  const open = navigation.branches[row.id] ?? row.id === tree.wrapper;
  const expandable = Boolean(children.get(row.id)?.length);
  const Chevron = open ? ChevronDown : ChevronRight;
  const Icon = row.outcome === 'folder' ? Folder : FileText;
  const isRoot = row.id === tree.wrapper;
  const title = row.sourceTitle || (isRoot ? t('desktop.superMemoDrafts.collectionRoot') : row.title || `#${row.id}`);
  const count = isRoot ? undefined : tree.descendants.get(row.id);
  const label = count ? `${title} (${count})` : title;
  return <li>
    <div className={`flex min-w-0 items-center gap-1 ${depth ? 'text-foreground/70' : ''}`}>
      {expandable ? <button type="button" aria-expanded={open}
        aria-label={t(open ? 'desktop.superMemoDrafts.collapseEntry' : 'desktop.superMemoDrafts.expandEntry', { id: row.id })}
        onClick={() => navigation.toggleBranch(row.id, !open)} className="grid size-7 shrink-0 place-items-center rounded hover:bg-foreground/10">
        <Chevron aria-hidden className="size-4" />
      </button> : <span className="w-7 shrink-0" />}
      <button type="button" title={label} aria-current={navigation.active === row.id ? 'true' : undefined}
        onClick={() => navigation.selectEntry(row.id)}
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-2 text-left hover:bg-foreground/5 aria-[current=true]:bg-[var(--role-selection-surface)]">
        <Icon aria-hidden className="size-4 shrink-0" />
        <span className="truncate">{title}</span>
        {count ? <span className="shrink-0 text-xs text-foreground/65">({count})</span> : null}
        {row.sourceTitle || row.title || isRoot ? <span className="shrink-0 text-xs text-foreground/65">#{row.id}</span> : null}

      </button>
      {!readOnly && row.structure?.editable ? <AppSwitch compact disabled={busy} checked={row.outcome === 'folder'}
        aria-label={t('desktop.superMemoDrafts.structureSwitch', { title, id: row.id })}
        onCheckedChange={folder => {
          if (folder && expandable) navigation.toggleBranch(row.id, true);
          onChange(row.id, folder);
        }} /> : null}
    </div>
    {open && expandable ? <ul className="ml-3 border-l border-foreground/15 pl-1">
      {children.get(row.id)?.map(child => <StructureRow key={child.id} row={child} depth={depth + 1} tree={tree} />)}
    </ul> : null}
  </li>;
}

function PreviewMarkdown({ value }: { value: string }) {
  return <MarkdownEditor nodeId={null} value={value} onChange={() => undefined}
    readOnly readOnlyInteractionMode="document" liveMarkdownEnabled scrollContainer="outer" />;
}

function SourceDocument({ row, element, wrapper, readOnly }: {
  row: Row; element: SuperMemoXmlDraftElement | undefined; wrapper: number | undefined; readOnly: boolean;
}) {
  const t = useTranslation();
  const body = convertSuperMemoContent(element?.bodyOrQuestionHtml ?? []).content;
  const answer = convertSuperMemoContent(element?.answerHtml ?? []).content;
  return <article className="space-y-3 break-words">
    <p className="text-xs text-foreground/70">#{row.id} · {t(kindKey[row.outcome])}</p>
    <h4 className="font-semibold">{row.sourceTitle || (row.id === wrapper ? t('desktop.superMemoDrafts.collectionRoot') : row.title || `#${row.id}`)}</h4>
    {!readOnly && row.structure?.folderBody ? <p className="text-xs">{t('desktop.superMemoDrafts.structureFolderBody')}</p> : null}
    {row.issue ? <p className="text-xs">{t(`desktop.superMemoDrafts.issue.${row.issue}`, { history: row.historyCount })}</p> : null}
    {row.historyNeedsReview ? <p className="text-xs">{t('desktop.superMemoDrafts.issue.history', { history: row.historyCount })}</p> : null}
    {body ? <PreviewMarkdown value={body} /> : null}
    {answer ? <div className="border-t border-settings-divider pt-3"><PreviewMarkdown value={answer} /></div> : null}
    {row.unresolvedImages?.length ? <>
      <p className="text-xs">{t('desktop.superMemoDrafts.unresolvedImages', {
        count: row.unresolvedImages.reduce((count, image) => count + image.count, 0)
      })}</p>
      <ul className="break-all text-xs text-foreground/70">
        {row.unresolvedImages.map(image => <li key={image.source}>{image.source}</li>)}
      </ul>
    </> : null}
    {!body && !answer ? <p className="text-foreground/65">{t('desktop.superMemoDrafts.structureNoBody')}</p> : null}
  </article>;
}

export function SuperMemoStructurePage({ preview, elements, ...controls }: {
  preview: Preview; elements: SuperMemoXmlDraftElement[];
} & Pick<TreeProps, 'navigation' | 'busy' | 'onChange'>) {
  const t = useTranslation();
  const { children, descendants, byId, wrapper, skipped, missing, missingCount, media } = useMemo(() => sourceTree(preview, elements), [preview, elements]);
  const readOnly = Boolean(preview.directoryUpdate);
  const sources = useMemo(() => new Map(elements.map(element => [element.id, element])), [elements]);
  const { tab, active, selectTab } = controls.navigation;
  const filtered = tab === 'skipped' ? skipped : tab === 'missing' ? missing : undefined;
  const current = byId.get(active ?? 0) ?? filtered?.[0];
  return <>
    <div className="shrink-0 space-y-1 text-sm text-muted-foreground">
      <p>{t(readOnly ? 'desktop.superMemoDrafts.structureUpdateHelp' : 'desktop.superMemoDrafts.structureHelp')}</p>
      {!preview.pairedCollection ? <p className="text-xs">{t('desktop.superMemoDrafts.structureXmlOrder')}</p> : null}
      <p>{t('desktop.superMemoDrafts.structureConversionNote')}</p>
    </div>
    <div className="grid h-[28rem] shrink-0 grid-cols-2 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-settings-divider text-sm">
      <section aria-label={t('desktop.superMemoDrafts.structureSource')} className="row-span-2 grid min-h-0 min-w-0 grid-rows-subgrid border-r border-settings-divider bg-settings-sidebar">
        <div className="flex flex-wrap gap-1 border-b border-settings-divider px-2">
          {tabs.map(key => <button type="button" key={key} aria-pressed={tab === key}
            className="border-b-2 border-transparent px-1.5 py-2 text-xs aria-pressed:border-[var(--role-accent)] aria-pressed:font-semibold"
            onClick={() => selectTab(key)}>
            {key === 'converted' ? t('desktop.superMemoDrafts.structureSource') :
              t(`desktop.superMemoDrafts.entries.${key}`, { count: key === 'skipped' ? skipped.length : missingCount })}
          </button>)}
        </div>
        <ul className="min-h-0 overflow-auto p-2">
          {(filtered ?? children.get(null))?.map(row => <StructureRow key={row.id} row={row} depth={0}
            tree={{ ...controls, children: filtered ? emptyChildren : children, descendants, wrapper, readOnly }} />)}
        </ul>
      </section>
      <section aria-label={t('desktop.superMemoDrafts.entryPreview')} className="row-span-2 grid min-h-0 min-w-0 grid-rows-subgrid">
        <h4 className="flex items-center border-b border-settings-divider px-3 py-2 font-medium">{t('desktop.superMemoDrafts.entryPreview')}</h4>
        <div key={current?.id} className="min-h-0 overflow-auto p-4">
          {current ? <SourceDocument row={current} element={sources.get(current.id)} wrapper={wrapper} readOnly={readOnly} /> :
            <p className="text-foreground/65">{t('desktop.superMemoDrafts.structureSelect')}</p>}
        </div>
      </section>
    </div>
    {media.local || media.remote || media.audio ? <p className="text-xs text-foreground/70">
      {t('desktop.superMemoDrafts.media', media)}
    </p> : null}
  </>;
}
