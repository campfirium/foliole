import { useId, useMemo, useState } from 'react';

import { addSuperMemoCitation, describeSuperMemoCitation } from '../../../../lib/core/import/superMemoCitation';
import { convertSuperMemoContent } from '../../../../lib/core/import/superMemoContent';
import { orderSuperMemoSourceRows, planSuperMemoImportParents } from '../../../../lib/core/import/superMemoImportParents';
import type { SuperMemoSourceFormat } from '../../../../lib/core/import/superMemoSourceFormatting';
import type { SuperMemoXmlDraftElement } from '../../../../lib/core/import/superMemoXmlDraft';
import type { NativeSuperMemoPreview, NativeSuperMemoPreviewRow } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppButton, AppTextarea, settingsFieldClassName } from '../../../shared/ui';

const legacyPlacementLabels = {
  metadata: 'desktop.superMemoDrafts.sourceMetadata',
  body: 'desktop.superMemoDrafts.sourceBody'
} as const;

const placements = [
  ['topic-info', 'desktop.superMemoDrafts.sourceTopicInfo'],
  ['content-end', 'desktop.superMemoDrafts.sourceContentEnd']
] as const;

function SourceTemplate({ template, disabled, onApply }: {
  template: string; disabled: boolean; onApply(template: string): void;
}) {
  const t = useTranslation();
  const [input, setInput] = useState(template);
  return <section className="grid gap-2">
    <label className="grid gap-2 font-medium">
      {t('desktop.superMemoDrafts.sourceTemplate')}
      <AppTextarea rows={4} maxLength={4000} spellCheck={false} value={input} disabled={disabled}
        className="min-h-24 font-mono text-sm" onChange={event => setInput(event.target.value)} />
    </label>
    <p className="text-xs text-foreground/70">
      {t('desktop.superMemoDrafts.sourceTemplateFields')}{' '}
      <code>{'{articleLink}, {title}, {author}, {url}, {date}, {publisher}, {comment}'}</code>
    </p>
    <div>
      <AppButton disabled={disabled || input === template} onClick={() => onApply(input)}>
        {t('desktop.superMemoDrafts.applySourceTemplate')}
      </AppButton>
    </div>
  </section>;
}

function sourceCandidates(rows: NativeSuperMemoPreviewRow[], elements: SuperMemoXmlDraftElement[]) {
  const byId = new Map(rows.map(row => [row.id, row]));
  const parents = planSuperMemoImportParents(orderSuperMemoSourceRows(rows));
  return elements.flatMap(element => {
    const row = byId.get(element.id);
    if ((row?.outcome !== 'topic' && row?.outcome !== 'item') || (!row.sourceArticleId && !row.sourceBibliography)) return [];
    const article = byId.get(row.sourceArticleId ?? 0);
    return [{
      element, row, parent: byId.get(parents.get(row.id) ?? 0),
      article: article && article.outcome !== 'skipped' ? { id: `preview:${article.id}`, title: article.title } : undefined
    }];
  });
}

type Candidate = ReturnType<typeof sourceCandidates>[number];

function SourceSample({ sample, citation, protectedCitation }: {
  sample: Candidate; citation: ReturnType<typeof describeSuperMemoCitation>; protectedCitation: boolean;
}) {
  const t = useTranslation();
  const { row, element } = sample;
  const body = convertSuperMemoContent(element.bodyOrQuestionHtml).content;
  const answer = row.outcome === 'item' ? convertSuperMemoContent(element.answerHtml).content : '';
  const content = addSuperMemoCitation(body, citation, 'content');
  const reveal = addSuperMemoCitation(answer, citation, 'reveal');
  const showLinkTitle = (value: string) => value.replace(/\[\[node-id:preview:\d+\|([^\]]*)\]\]/gu, '$1');
  return <>
    <article className="max-h-64 space-y-3 overflow-auto break-words rounded-md border border-[var(--role-content-line)] bg-[var(--role-content-bg)] p-4">
      <h4 className="font-semibold">{row.title || `#${row.id}`}</h4>
      <div className="whitespace-pre-wrap">{showLinkTitle(content)}</div>
      {reveal && <div className="whitespace-pre-wrap border-t border-[var(--role-content-line)] pt-3">{showLinkTitle(reveal)}</div>}
    </article>
    {protectedCitation || (body === content && answer === reveal) ? <p className="text-xs text-foreground/70">
      {t(protectedCitation ? 'desktop.superMemoDrafts.sourceSampleProtected' : 'desktop.superMemoDrafts.sourceSampleUnchanged')}
    </p> : null}
  </>;
}

export function SuperMemoSourcePage({ preview, elements, value, disabled, onChange }: {
  preview: NativeSuperMemoPreview; elements: SuperMemoXmlDraftElement[]; value: SuperMemoSourceFormat;
  disabled: boolean; onChange(next: SuperMemoSourceFormat): void;
}) {
  const t = useTranslation();
  const group = useId();
  const [sampleId, setSampleId] = useState<number>();
  const candidates = useMemo(() => sourceCandidates(preview.rows, elements), [preview.rows, elements]);
  const citationFor = ({ row, parent, article }: Candidate) => describeSuperMemoCitation(row, parent, article, value);
  const sample = candidates.find(candidate => candidate.row.id === sampleId) ?? candidates.find(citationFor) ?? candidates[0];
  const choices = value.placement === 'metadata' || value.placement === 'body'
    ? [[value.placement, legacyPlacementLabels[value.placement]] as const, ...placements] : placements;
  const protectedCitation = preview.directoryUpdate?.citationChanges.some(change =>
    change.sourceId === sample?.row.id && change.status === 'protected') ?? false;

  return <div className="mx-auto grid w-full max-w-3xl gap-5 text-sm">
    <fieldset disabled={disabled} className="grid gap-2">
      <legend className="mb-2 font-semibold">{t('desktop.superMemoDrafts.sourceInformation')}</legend>
      {choices.map(([placement, label]) => (
        <label key={placement} className="flex cursor-pointer items-center gap-2">
          <input type="radio" name={group} className="accent-[var(--role-accent)]" checked={value.placement === placement}
            onChange={() => onChange({ ...value, placement })} />
          {t(label)}
        </label>
      ))}
    </fieldset>
    {value.placement === 'content-end' || value.placement === 'body' ? <SourceTemplate key={value.template}
      template={value.template} disabled={disabled} onApply={template => onChange({ ...value, template })} /> : null}
    <section aria-label={t('desktop.superMemoDrafts.sourceExample')} className="grid min-w-0 gap-3">
      <h3 className="font-semibold">{t('desktop.superMemoDrafts.sourceExample')}</h3>
      {preview.directoryUpdate && <p className="text-xs text-foreground/70">{t('desktop.superMemoDrafts.sourceSampleExport')}</p>}
      {sample ? <>
        <select aria-label={t('desktop.superMemoDrafts.sourceSampleMaterial')} className={settingsFieldClassName('h-9 min-w-0 px-2')}
          value={sample.row.id} onChange={event => setSampleId(Number(event.target.value))}>
          {candidates.map(({ row }) => <option key={row.id} value={row.id}>{row.title} · #{row.id}</option>)}
        </select>
        <SourceSample sample={sample} citation={protectedCitation ? null : citationFor(sample)} protectedCitation={protectedCitation} />
      </> : <p className="text-foreground/70">{t('desktop.superMemoDrafts.sourceSampleNone')}</p>}
    </section>
  </div>;
}
