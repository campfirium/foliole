import type { NativeSuperMemoPreviewRow } from '../../platform/nativeSuperMemoImportContract.js';
import type { ReviewSchedulerSettings } from '../review/settings.js';

import { convertHtmlToMarkdownCompatible } from './htmlToMarkdownCompatible.js';
import { convertSuperMemoContent } from './superMemoContent.js';
import { previewSuperMemoSchedule, sourceCandidate, type SuperMemoGradeMap } from './superMemoSchedulePreview.js';
import type { SuperMemoXmlDraftElement } from './superMemoXmlDraft.js';

function usableText(parts: string[]) {
  return parts.map(part => convertHtmlToMarkdownCompatible(part).content).filter(Boolean).join('\n');
}

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
  settings: ReviewSchedulerSettings, gradeMap?: SuperMemoGradeMap): (NativeSuperMemoPreviewRow & { localImageReferences: [string, number][] })[] {
  return elements.map(element => {
    const sourceBody = convertSuperMemoContent(element.bodyOrQuestionHtml);
    const sourceAnswer = convertSuperMemoContent(element.answerHtml);
    const { content } = sourceBody;
    const { content: answer } = sourceAnswer;
    const result = classify(element, Boolean(content), Boolean(answer));
    const interval = Number(element.learning?.intervalDays);
    const reviewable = result.outcome === 'item' && result.issue === null;
    return {
      ...result, ...previewSuperMemoSchedule(element, offset, settings, reviewable, gradeMap),
      id: element.id, parentId: element.parentId, sourceType: element.sourceType,
      title: element.title ? usableText([element.title]) : (content || answer).slice(0, 140),
      intervalDays: Number.isSafeInteger(interval) && interval > 0 ? interval : null,
      lastRepetition: element.learning?.lastRepetition ?? null,
      historyCount: element.learning?.history.length ?? 0,
      localImageReferences: [
        ...(result.outcome === 'topic' || result.outcome === 'item' ? sourceBody.localSources : []),
        ...(result.outcome === 'item' ? sourceAnswer.localSources : [])
      ],
      localImages: sourceBody.localImages + sourceAnswer.localImages,
      remoteImages: sourceBody.remoteImages + sourceAnswer.remoteImages,
      skippedAudio: element.skippedAudioComponents + sourceBody.audio + sourceAnswer.audio
    };
  });
}
