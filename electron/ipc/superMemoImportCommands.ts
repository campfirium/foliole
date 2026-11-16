import { createHash } from 'node:crypto';

import { z } from 'zod';

import { DEFAULT_SUPER_MEMO_GRADE_MAP } from '../../lib/core/import/superMemoSchedulePreview.js';
import { DEFAULT_SUPER_MEMO_SOURCE_FORMAT, formatSuperMemoSource } from '../../lib/core/import/superMemoSourceFormatting.js';
import { describeSuperMemoSource } from '../../lib/core/import/superMemoSourcePreview.js';
import { calendarDateKey } from '../../lib/core/review/reviewCalendarDates.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import type { NativeSuperMemoPreview } from '../../lib/platform/nativeSuperMemoImportContract.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { adjustSuperMemoImport, listSuperMemoImports } from '../import/adjustSuperMemoImport.js';
import { inspectSuperMemoImageSources } from '../import/prepareSuperMemoTopicContent.js';
import { runSuperMemoImport } from '../import/runSuperMemoImport.js';
import { confirmSuperMemoDirectoryUpdate, updateSuperMemoDirectories } from '../import/updateSuperMemoDirectories.js';
import { loadReviewSchedulerSettings } from '../reviewSchedulerSettings.js';

import { readSuperMemoCollection } from './readSuperMemoCollection.js';

const elementSchema = z.object({
  id: z.number().int().positive(),
  parentId: z.number().int().positive().nullable(),
  children: z.array(z.number().int().positive()),
  sourceType: z.string().min(1).max(100),
  title: z.string().nullable(),
  ordinal: z.string().nullable(),
  bodyOrQuestionHtml: z.array(z.string()),
  answerHtml: z.array(z.string()),
  skippedAudioComponents: z.number().int().nonnegative(),
  learning: z.object({
    lastRepetition: z.string().nullable(),
    intervalDays: z.string().nullable(),
    repetitions: z.string().nullable(),
    lapses: z.string().nullable(),
    sourceAFactor: z.string().nullable(),
    sourceUFactor: z.string().nullable(),
    history: z.array(z.object({ date: z.string(), hour: z.string().nullable(), grade: z.number().int().nonnegative(),
      repetition: z.number().int().nonnegative(), lapses: z.number().int().nonnegative(), raw: z.string() }))
  }).nullable()
});
const grade = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
const previewSchema = z.object({ elements: z.array(elementSchema).min(1), collectionDirectory: z.string().optional(),
  sourceFormat: z.object({ placement: z.enum(['metadata', 'body', 'topic-info', 'content-end']), template: z.string().max(4000) }).optional(),
  updateSignature: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  gradeMap: z.array(grade).length(6).optional(), previewSignature: z.string().regex(/^[a-f0-9]{64}$/).optional() });

function sourceOffset(now: Date) {
  const offset = -now.getTimezoneOffset();
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
  const minutes = String(Math.abs(offset) % 60).padStart(2, '0');
  return `${offset < 0 ? '-' : '+'}${hours}:${minutes}`;
}

async function finishSuperMemoImport(input: Parameters<typeof runSuperMemoImport>[0], write: boolean,
  previewSignature?: string, updateSignature?: string) {
  const { elements, preview } = input;
  if (!write) {
    const update = updateSuperMemoDirectories(elements, preview);
    return update ? { ...preview, directoryUpdate: update } : preview;
  }
  if (!updateSignature) return runSuperMemoImport(input);
  if (!previewSignature) throw new Error('supermemo_update_preview_required');
  const update = await confirmSuperMemoDirectoryUpdate(input, updateSignature);
  if (!update) throw new Error('supermemo_update_source_changed');
  return { batchId: update.batchId, imported: update.imported, skipped: update.skipped,
    unresolvedImages: update.unresolvedImages, directoryUpdate: update };
}

export async function handleSuperMemoImportCommand(command: string, args: unknown) {
  if (command === NATIVE_COMMANDS.listSuperMemoImports) return runWithDatabaseConnectionOwner(listSuperMemoImports);
  const previewAdjustment = command === NATIVE_COMMANDS.previewSuperMemoAdjustment;
  if (previewAdjustment || command === NATIVE_COMMANDS.adjustSuperMemoImport) {
    const { batchId, percent } = z.object({ batchId: z.string().regex(/^[a-f0-9]{64}$/),
      percent: z.number().int().min(0).max(100) }).parse(args);
    return runWithDatabaseConnectionOwner(() => adjustSuperMemoImport(batchId, percent, previewAdjustment));
  }
  const write = command === NATIVE_COMMANDS.runSuperMemoImport;
  if (!write && command !== NATIVE_COMMANDS.previewSuperMemoImport) return undefined;
  const percent = write ? z.object({ percent: z.number().int().min(0).max(100) }).parse(args).percent : 0;
  const { elements, collectionDirectory, gradeMap = DEFAULT_SUPER_MEMO_GRADE_MAP, previewSignature, updateSignature, sourceFormat = DEFAULT_SUPER_MEMO_SOURCE_FORMAT } = previewSchema.parse(args);
  const seen = new Set<number>();
  for (const { id, parentId } of elements) {
    if (seen.has(id) || (parentId !== null && !seen.has(parentId))) throw new Error('invalid_supermemo_element_tree');
    seen.add(id);
  }
  const collection = collectionDirectory ? await readSuperMemoCollection(collectionDirectory, elements) : null;
  return runWithDatabaseConnectionOwner(async () => {
    const now = new Date();
    const offset = sourceOffset(now);
    const scheduler = loadReviewSchedulerSettings();
    const rows = describeSuperMemoSource(elements, offset, scheduler, gradeMap);
    const rowsById = new Map(rows.map(row => [row.id, row]));
    const sources = new Set(rows.flatMap(row => row.localImageReferences.map(([source]) => source)));
    const images = await inspectSuperMemoImageSources(sources, collectionDirectory);
    const preview: NativeSuperMemoPreview = {
      referenceDay: calendarDateKey(now), pairedCollection: collection !== null, rows: rows.map(({ localImageReferences, ...row }) => {
        const missing = new Map<string, number>();
        for (const [source, count] of localImageReferences) {
          if (!images.get(source)) missing.set(source, (missing.get(source) ?? 0) + count);
        }
        row.unresolvedImages = [...missing].map(([source, count]) => ({ source, count }));
        const paired = collection?.fields.get(row.id);
        if (!paired) return row;
        const reset = paired.state === 'pending';
        const bibliography = paired.referenceId ? collection?.bibliography.get(paired.referenceId) : undefined;
        const article = paired.articleId ? rowsById.get(paired.articleId) : undefined;
        const sourceExample = formatSuperMemoSource(bibliography, paired.articleId,
          article && article.outcome !== 'skipped' ? { id: `preview:${article.id}`, title: article.title } : undefined, sourceFormat);
        return { ...row, ...(sourceExample ? { sourceExample } : {}), ...(bibliography ? { sourceBibliography: bibliography } : {}), sourceState: paired.state, sourceDue: reset || paired.state === 'dismissed' ? null : paired.due,
          sourceConceptGroupId: paired.conceptGroupId,
          sourceConceptFolderId: paired.conceptGroupId ? collection?.groups.get(paired.conceptGroupId) ?? null : null,
          sourceArticleId: paired.articleId, sourceReferenceId: paired.referenceId,
          sourceRank: paired.rank, sourceChildren: paired.children,
          ...(reset ? { recalculatedDue: null, replayedCount: 0, historyNeedsReview: false } : {}) };
      })
    };
    preview.previewSignature = createHash('sha256')
      .update(JSON.stringify({ elements, collectionDirectory, preview, offset, scheduler, gradeMap, sourceFormat, images: [...images] })).digest('hex');
    if (write && previewSignature && preview.previewSignature !== previewSignature) {
      throw new Error('supermemo_preview_changed');
    }
    return finishSuperMemoImport({ elements, preview, percent, offset, collectionDirectory, gradeMap, scheduler, sourceFormat, expectedImages: images },
      write, previewSignature, updateSignature);
  });
}
