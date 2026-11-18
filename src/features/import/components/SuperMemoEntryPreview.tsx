import { CircleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';

import { convertSuperMemoContent } from '../../../../lib/core/import/superMemoContent';
import { orderSuperMemoSourceRows, planSuperMemoImportParents } from '../../../../lib/core/import/superMemoImportParents';
import type { SuperMemoXmlDraftElement } from '../../../../lib/core/import/superMemoXmlDraft';
import type { NativeSuperMemoPreview, NativeSuperMemoPreviewRow as Row } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';

import { SuperMemoEntryButton, SuperMemoPreviewDestination } from './SuperMemoPreviewTree';

const tabs = ['converted', 'skipped', 'missing'] as const;
type Tab = typeof tabs[number];

function prepareEntries(rows: Row[], collectionRoot?: number) {
  const ordered = orderSuperMemoSourceRows(rows);
  const parents = planSuperMemoImportParents(ordered);
  const childrenByParent = new Map<number | null, Row[]>();
  const lists: Record<Tab, Row[]> = { converted: [], skipped: [], missing: [] };
  let missingCount = 0;
  const media = { local: 0, remote: 0, audio: 0 };
  for (const row of ordered) {
    media.local += row.localImages ?? 0;
    media.remote += row.remoteImages ?? 0;
    media.audio += row.skippedAudio ?? 0;
    if (row.outcome === 'skipped') lists.skipped.push(row);
    else {
      lists.converted.push(row);
      const parent = parents.get(row.id) ?? null;
      const children = childrenByParent.get(parent) ?? [];
      children.push(row);
      childrenByParent.set(parent, children);
    }
    if (row.unresolvedImages?.length) {
      lists.missing.push(row);
      missingCount += row.unresolvedImages.reduce((count, image) => count + image.count, 0);
    }
  }
  const roots = childrenByParent.get(null) ?? [];
  const rootIndex = roots.findIndex(row => row.id === collectionRoot);
  if (rootIndex >= 0) roots.push(...roots.splice(rootIndex, 1));
  const initial = roots.find(row => row.id !== collectionRoot && row.outcome !== 'folder')
    ?? roots.flatMap(row => childrenByParent.get(row.id) ?? []).find(row => row.outcome !== 'folder')
    ?? roots[0];
  return { childrenByParent, lists, missingCount, media, initial };
}

function Notice({ children }: { children: string }) {
  return (
    <p className="flex items-start gap-2 rounded-md bg-foreground/5 px-3 py-2 text-foreground/75">
      <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0 text-error" />
      <span>{children}</span>
    </p>
  );
}

function EntryContent({ row, source, tab }: { row: Row; source?: SuperMemoXmlDraftElement | undefined; tab: Tab }) {
  const t = useTranslation();
  const content = useMemo(() => {
    if (!source || tab !== 'converted' || row.outcome === 'folder') return null;
    return {
      body: convertSuperMemoContent(source.bodyOrQuestionHtml).content,
      answer: row.outcome === 'item' ? convertSuperMemoContent(source.answerHtml).content : ''
    };
  }, [row, source, tab]);
  const missing = row.unresolvedImages ?? [];
  return (
    <div className="space-y-3 break-words">
      <h3 className="truncate text-sm font-semibold leading-7" title={row.title}>{row.title || `#${row.id}`}</h3>
      {row.issue ? <Notice>{t(`desktop.superMemoDrafts.issue.${row.issue}`, { history: row.historyCount })}</Notice> : null}
      {row.historyNeedsReview ? <Notice>{t('desktop.superMemoDrafts.issue.history', { history: row.historyCount })}</Notice> : null}
      {content?.body ? <div className="whitespace-pre-wrap">{content.body}</div> : null}
      {content?.answer ? <>{content.body ? <hr className="border-foreground/15" /> : null}
        <div className="whitespace-pre-wrap">{content.answer}</div></> : null}
      {missing.length ? <>
        <Notice>{t('desktop.superMemoDrafts.unresolvedImages', {
          count: missing.reduce((count, image) => count + image.count, 0)
        })}</Notice>
        <ul className="divide-y divide-foreground/10 break-all rounded-md border border-foreground/10 px-3 text-xs text-foreground/75">
          {missing.map(({ source, count }) => <li className="py-2" key={source}>{source}{count > 1 ? ` × ${count}` : ''}</li>)}
        </ul>
      </> : null}
    </div>
  );
}

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

export function SuperMemoEntryPreview({ preview, elements, navigation }: {
  navigation: ReturnType<typeof useSuperMemoPreviewNavigation>;
  preview?: NativeSuperMemoPreview | undefined; elements?: SuperMemoXmlDraftElement[] | undefined;
}) {
  const t = useTranslation();
  const { tab, active, selectTab, selectEntry, branches, toggleBranch } = navigation;
  const collectionRoot = elements?.find(row => row.parentId === null && row.ordinal === '0' && !row.title && row.children.length);
  const { childrenByParent, lists, missingCount, media, initial } = useMemo(() => prepareEntries(
    (preview?.rows ?? []).map(row => row.id === collectionRoot?.id
      ? { ...row, title: t('desktop.superMemoDrafts.collectionRoot') } : row),
    collectionRoot?.id
  ), [preview?.rows, collectionRoot?.id, t]);
  const sources = useMemo(() => new Map(elements?.map(row => [row.id, row])), [elements]);
  const rows = lists[tab];
  const current = rows.find(row => row.id === active) ?? (tab === 'converted' ? initial : rows[0]);
  return (
    <div className="grid min-h-0 gap-2">
      <div className="grid h-[clamp(20rem,56vh,36rem)] min-h-0 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-foreground/15 text-sm">
        <section aria-label={t('desktop.superMemoDrafts.entries')} className="row-span-2 grid min-h-0 min-w-0 grid-rows-subgrid border-r border-foreground/10 bg-foreground/[0.025]">
          <div className="flex min-h-11 flex-wrap items-stretch gap-4 border-b border-foreground/10 px-3">
            {tabs.map(key => (
              <button type="button" key={key} aria-pressed={tab === key} disabled={!preview}
                className="border-b-2 border-transparent py-1 text-xs text-foreground/65 hover:text-foreground aria-pressed:border-[var(--role-accent)] aria-pressed:font-semibold aria-pressed:text-foreground disabled:opacity-50"
                onClick={() => selectTab(key)}>
                {t(`desktop.superMemoDrafts.entries.${key}`, { count: key === 'missing' ? missingCount : lists[key].length })}
              </button>
            ))}
          </div>
          <div className="min-h-0 overflow-auto p-2">
            {tab === 'converted' ? (
              preview ? <SuperMemoPreviewDestination childrenByParent={childrenByParent} active={current?.id} onSelect={selectEntry}
                branches={branches} toggleBranch={toggleBranch} /> : null
            ) : <ul>{rows.map(row => <li key={row.id} className="flex min-w-0">
              <SuperMemoEntryButton row={row} active={current?.id} onSelect={selectEntry} />
            </li>)}</ul>}
          </div>
        </section>
        <section aria-label={t('desktop.superMemoDrafts.entryPreview')} className="row-span-2 grid min-h-0 min-w-0 grid-rows-subgrid">
          <h2 className="flex min-h-11 items-center border-b border-foreground/10 px-4 text-xs font-medium text-foreground/70">
            {t('desktop.superMemoDrafts.entryPreview')}
          </h2>
          <div className="min-h-0 overflow-auto px-4 py-2" key={current?.id}>
            {current ? <EntryContent row={current} tab={tab} source={sources.get(current.id)} /> : preview ? (
              <p className="text-foreground/60">{t('desktop.superMemoDrafts.noEntries')}</p>
            ) : null}
          </div>
        </section>
      </div>
      {media.local || media.remote || media.audio ? <p className="px-1 text-xs text-foreground/65">
        {t('desktop.superMemoDrafts.media', media)}
      </p> : null}
    </div>
  );
}
