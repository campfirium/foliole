import { useMemo, useState } from 'react';

import { convertSuperMemoContent } from '../../../../lib/core/import/superMemoContent';
import { orderSuperMemoSourceRows, planSuperMemoImportParents } from '../../../../lib/core/import/superMemoImportParents';
import type { SuperMemoXmlDraftElement } from '../../../../lib/core/import/superMemoXmlDraft';
import type { NativeSuperMemoPreview, NativeSuperMemoPreviewRow as Row } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppButton } from '../../../shared/ui';

import { SuperMemoEntryButton, SuperMemoPreviewTree } from './SuperMemoPreviewTree';

const tabs = ['converted', 'skipped', 'missing'] as const;
type Tab = typeof tabs[number];

function prepareEntries(rows: Row[]) {
  const ordered = orderSuperMemoSourceRows(rows);
  const parents = planSuperMemoImportParents(ordered);
  const childrenByParent = new Map<number | null, Row[]>();
  const lists: Record<Tab, Row[]> = { converted: [], skipped: [], missing: [] };
  let missingCount = 0;
  for (const row of ordered) {
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
  return { childrenByParent, lists, missingCount };
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
      <h3 className="font-medium">{row.title || `#${row.id}`}</h3>
      {row.issue ? <p className="text-error">{t(`desktop.superMemoDrafts.issue.${row.issue}`, { history: row.historyCount })}</p> : null}
      {row.historyNeedsReview ? <p className="text-error">{t('desktop.superMemoDrafts.issue.history', { history: row.historyCount })}</p> : null}
      {content?.body ? <div className="whitespace-pre-wrap">{content.body}</div> : null}
      {content?.answer ? <>{content.body ? <hr className="border-foreground/15" /> : null}
        <div className="whitespace-pre-wrap">{content.answer}</div></> : null}
      {missing.length ? <>
        <p className="text-error">{t('desktop.superMemoDrafts.unresolvedImages', {
          count: missing.reduce((count, image) => count + image.count, 0)
        })}</p>
        <ul className="list-disc break-all pl-5">{missing.map(({ source, count }) =>
          <li key={source}>{source}{count > 1 ? ` × ${count}` : ''}</li>)}</ul>
      </> : null}
    </div>
  );
}

export function SuperMemoEntryPreview({ preview, elements }: {
  preview: NativeSuperMemoPreview; elements: SuperMemoXmlDraftElement[];
}) {
  const t = useTranslation();
  const [tab, setTab] = useState<Tab>('converted');
  const [active, setActive] = useState<number>();
  const { childrenByParent, lists, missingCount } = useMemo(() => prepareEntries(preview.rows), [preview.rows]);
  const sources = useMemo(() => new Map(elements.map(row => [row.id, row])), [elements]);
  const rows = lists[tab];
  const current = rows.find(row => row.id === active) ?? rows[0];
  return (
    <div className="grid h-[min(56vh,36rem)] min-h-0 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] overflow-hidden rounded-lg border border-foreground/15 text-sm">
      <section className="flex min-h-0 min-w-0 flex-col border-r border-foreground/15 bg-[var(--role-nav-bg)]">
        <div className="flex flex-wrap gap-1 border-b border-foreground/15 p-2" aria-label={t('desktop.superMemoDrafts.entries')}>
          {tabs.map(key => (
            <AppButton key={key} variant={tab === key ? 'default' : 'ghost'} aria-pressed={tab === key}
              onClick={() => { setTab(key); setActive(undefined); }}>
              {t(`desktop.superMemoDrafts.entries.${key}`, { count: key === 'missing' ? missingCount : lists[key].length })}
            </AppButton>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2">
          {tab === 'converted' ? (
            <SuperMemoPreviewTree childrenByParent={childrenByParent} parent={null} active={current?.id} onSelect={setActive} />
          ) : <ul>{rows.map(row => <li key={row.id} className="flex">
            <SuperMemoEntryButton row={row} active={current?.id} onSelect={setActive} />
          </li>)}</ul>}
        </div>
      </section>
      <section aria-label={t('desktop.superMemoDrafts.entryPreview')} className="min-h-0 min-w-0 overflow-auto p-4">
        {current ? <EntryContent row={current} tab={tab} source={sources.get(current.id)} /> : (
          <p>{t('desktop.superMemoDrafts.noEntries')}</p>
        )}
      </section>
    </div>
  );
}
