import { createHash } from 'node:crypto';

import { z } from 'zod';

import { DEFAULT_SUPER_MEMO_GRADE_MAP } from '../../lib/core/import/superMemoSchedulePreview.js';
import { describeSuperMemoSource } from '../../lib/core/import/superMemoSourcePreview.js';
import { calendarDateKey } from '../../lib/core/review/reviewCalendarDates.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import type { NativeSuperMemoPreview } from '../../lib/platform/nativeSuperMemoImportContract.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { adjustSuperMemoImport, listSuperMemoImports } from '../import/adjustSuperMemoImport.js';
import { inspectSuperMemoImageSources } from '../import/prepareSuperMemoTopicContent.js';
import { runSuperMemoImport } from '../import/runSuperMemoImport.js';
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
  gradeMap: z.array(grade).length(6).optional(), previewSignature: z.string().regex(/^[a-f0-9]{64}$/).optional() });

function sourceOffset(now: Date) {
  const offset = -now.getTimezoneOffset();
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
  const minutes = String(Math.abs(offset) % 60).padStart(2, '0');
  return `${offset < 0 ? '-' : '+'}${hours}:${minutes}`;
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
  const { elements, collectionDirectory, gradeMap = DEFAULT_SUPER_MEMO_GRADE_MAP, previewSignature } = previewSchema.parse(args);
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
    const sources = new Set(rows.flatMap(row => row.localImageReferences.map(([source]) => source)));
    const images = await inspectSuperMemoImageSources(sources, collectionDirectory);
    const preview: NativeSuperMemoPreview = {
      referenceDay: calendarDateKey(now), pairedCollection: collection !== null, rows: rows.map(({ localImageReferences, ...row }) => {
        const missing = new Map<string, number>();
        for (const [source, count] of localImageReferences) {
          if (!images.get(source)) missing.set(source, (missing.get(source) ?? 0) + count);
        }
        row.unresolvedImages = [...missing].map(([source, count]) => ({ source, count }));
        const paired = collection?.get(row.id);
        if (!paired) return row;
        const reset = paired.state === 'pending';
        return { ...row, sourceState: paired.state, sourceDue: reset || paired.state === 'dismissed' ? null : paired.due,
          sourceRank: paired.rank, sourceChildren: paired.children,
          ...(reset ? { recalculatedDue: null, replayedCount: 0, historyNeedsReview: false } : {}) };
      })
    };
    preview.previewSignature = createHash('sha256')
      .update(JSON.stringify({ elements, collectionDirectory, preview, offset, scheduler, gradeMap, images: [...images] })).digest('hex');
    if (write && previewSignature && preview.previewSignature !== previewSignature) {
      throw new Error('supermemo_preview_changed');
    }
    return write ? runSuperMemoImport({ elements, preview, percent, offset, collectionDirectory, gradeMap, scheduler, expectedImages: images }) : preview;
  });
}
