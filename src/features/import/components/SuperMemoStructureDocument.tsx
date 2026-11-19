import { useMemo } from 'react';

import { convertSuperMemoContent } from '../../../../lib/core/import/superMemoContent';
import { addSuperMemoReferenceHeading, superMemoReferenceHeading } from '../../../../lib/core/import/superMemoTopicTitle';
import type { SuperMemoXmlBody } from '../../../../lib/core/import/superMemoXmlDraft';
import type { NativeSuperMemoPreviewRow as Row } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppSpinner } from '../../../shared/ui';
import { MarkdownEditor } from '../../editor/components/MarkdownEditor';

function PreviewMarkdown({ value }: { value: string }) {
  return <MarkdownEditor nodeId={null} value={value} onChange={() => undefined}
    className="!h-auto !min-h-0 [--content-panel-font-size:var(--text-sm)] [--document-content-inline-padding:0px]"
    readOnly readOnlyInteractionMode="document" liveMarkdownEnabled scrollContainer="outer" />;
}

type SourceContent = 'loading' | 'unavailable' | ReadonlyMap<number, SuperMemoXmlBody>;

export function SuperMemoStructureDocument({ row, content }: {
  row: Row; content: SourceContent;
}) {
  const t = useTranslation();
  const element = typeof content === 'string' ? undefined : content.get(row.id);
  const body = useMemo(() => convertSuperMemoContent(element?.bodyOrQuestionHtml ?? []).content, [element]);
  const answer = useMemo(() => convertSuperMemoContent(element?.answerHtml ?? []).content, [element]);
  const text = addSuperMemoReferenceHeading(body, element && superMemoReferenceHeading(row));
  return <article className="space-y-3 break-words">
    {row.issue ? <p className="text-xs">{t(`desktop.superMemoDrafts.issue.${row.issue}`, { history: row.historyCount })}</p> : null}
    {row.historyNeedsReview ? <p className="text-xs">{t('desktop.superMemoDrafts.issue.history', { history: row.historyCount })}</p> : null}
    {text ? <PreviewMarkdown value={text} /> : null}
    {answer ? <div className="border-t border-settings-divider pt-3"><PreviewMarkdown value={answer} /></div> : null}
    {row.unresolvedImages?.length ? <>
      <p className="text-xs">{t('desktop.superMemoDrafts.unresolvedImages', {
        count: row.unresolvedImages.reduce((count, image) => count + image.count, 0)
      })}</p>
      <ul className="break-all text-xs text-foreground/70">
        {row.unresolvedImages.map(image => <li key={image.source}>{image.source}</li>)}
      </ul>
    </> : null}
    {content === 'loading' ? <AppSpinner size="sm" label={t('desktop.superMemoDrafts.structureBodyLoading')} /> : null}
    {content === 'unavailable' || (typeof content !== 'string' && !element) ?
      <p className="text-foreground/65">{t('desktop.superMemoDrafts.structureBodyUnavailable')}</p> : null}
    {element && !body && !answer ? <p className="text-foreground/65">{t('desktop.superMemoDrafts.structureNoBody')}</p> : null}
  </article>;
}
