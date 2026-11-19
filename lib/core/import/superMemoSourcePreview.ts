import type { NativeSuperMemoPreviewRow } from '../../platform/nativeSuperMemoImportContract.js';
import type { ReviewSchedulerSettings } from '../review/settings.js';

import { readSuperMemoXmlReferences } from './readSuperMemoXmlReferences.js';
import type { SuperMemoBibliography } from './superMemoBibliography.js';
import { superMemoCitationOrigin } from './superMemoCitation.js';
import { convertSuperMemoContent } from './superMemoContent.js';
import { previewSuperMemoSchedule, sourceCandidate, type SuperMemoGradeMap } from './superMemoSchedulePreview.js';
import { superMemoElementTitle } from './superMemoTopicTitle.js';
import type { SuperMemoXmlDraftElement } from './superMemoXmlDraft.js';

function classify(element: SuperMemoXmlDraftElement, content: boolean, answer: boolean):
Pick<NativeSuperMemoPreviewRow, 'outcome' | 'issue'> {
  if (element.sourceType === 'Concept') return { outcome: 'folder', issue: null };
  if (element.sourceType === 'Topic') {
    if (content) return { outcome: 'topic', issue: null };
    if (element.title?.trim() && element.children.length && !element.learning?.history.length &&
        !sourceCandidate(element.learning) && !Number(element.learning?.repetitions) && !Number(element.learning?.lapses)) {
      return { outcome: 'folder', issue: null };
    }
    return { outcome: 'skipped', issue: 'empty-topic' };
  }
  if (element.sourceType === 'Item') {
    if (!content && !answer) return { outcome: 'skipped', issue: 'empty-item' };
    return { outcome: 'item', issue: !content ? 'missing-question' : !answer ? 'missing-answer' : null };
  }
  return { outcome: 'skipped', issue: 'unsupported-type' };
}

export function describeSuperMemoSource(elements: SuperMemoXmlDraftElement[], offset: string,
  settings: ReviewSchedulerSettings, gradeMap?: SuperMemoGradeMap, includeConceptBody = false,
  pairedSourceFor?: (id: number) => { articleId: number | null; bibliography?: SuperMemoBibliography | undefined } | undefined): (NativeSuperMemoPreviewRow & { localImageReferences: [string, number][] })[] {
  const rows = elements.map(element => {
    const sourceBody = convertSuperMemoContent(element.bodyOrQuestionHtml);
    const sourceAnswer = convertSuperMemoContent(element.answerHtml);
    const { content } = sourceBody;
    const { content: answer } = sourceAnswer;
    const xmlBibliography = readSuperMemoXmlReferences([...element.bodyOrQuestionHtml, ...element.answerHtml]);
    const paired = pairedSourceFor?.(element.id);
    const pairedBibliography = paired?.bibliography;
    const sourceBibliography = xmlBibliography ? { ...pairedBibliography, ...xmlBibliography } : pairedBibliography;
    const result = classify(element, Boolean(content || (element.sourceType === 'Topic' && sourceBibliography?.title)), Boolean(answer));
    const interval = Number(element.learning?.intervalDays);
    const reviewable = result.outcome === 'item' && result.issue === null;
    return {
      ...result, ...previewSuperMemoSchedule(element, offset, settings, reviewable, gradeMap),
      id: element.id, parentId: element.parentId, sourceType: element.sourceType,
      title: superMemoElementTitle(element, content, answer, sourceBibliography?.title),
      ownTitle: superMemoElementTitle(element, content, answer, sourceBibliography?.title, false),
      ...(paired ? { sourceArticleId: paired.articleId } : {}),
      ...(sourceBibliography ? { sourceBibliography } : {}),
      intervalDays: Number.isSafeInteger(interval) && interval > 0 ? interval : null,
      lastRepetition: element.learning?.lastRepetition ?? null,
      historyCount: element.learning?.history.length ?? 0,
      localImageReferences: [
        ...(result.outcome === 'topic' || result.outcome === 'item' || (includeConceptBody && element.sourceType === 'Concept') ? sourceBody.localSources : []),
        ...(result.outcome === 'item' ? sourceAnswer.localSources : [])
      ],
      localImages: sourceBody.localImages + sourceAnswer.localImages,
      remoteImages: sourceBody.remoteImages + sourceAnswer.remoteImages,
      skippedAudio: element.skippedAudioComponents + sourceBody.audio + sourceAnswer.audio
    };
  });
  const rowsById = new Map(rows.map(row => [row.id, row]));
  return rows.map(({ ownTitle, ...row }) => ({
    ...row,
    title: superMemoCitationOrigin(row, rowsById) || (row.sourceArticleId && row.sourceArticleId !== row.id) ? ownTitle : row.title
  }));
}
