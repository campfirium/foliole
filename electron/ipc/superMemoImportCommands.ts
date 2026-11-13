import { z } from 'zod';

import { describeSuperMemoSource } from '../../lib/core/import/superMemoSourcePreview.js';
import { calendarDateKey } from '../../lib/core/review/reviewCalendarDates.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import type { NativeSuperMemoPreview } from '../../lib/platform/nativeSuperMemoImportContract.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { adjustSuperMemoImport, listSuperMemoImports } from '../import/adjustSuperMemoImport.js';
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
const previewSchema = z.object({ elements: z.array(elementSchema).min(1), collectionDirectory: z.string().optional() });

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
  const { elements, collectionDirectory } = previewSchema.parse(args);
  const seen = new Set<number>();
  for (const { id, parentId } of elements) {
    if (seen.has(id) || (parentId !== null && !seen.has(parentId))) throw new Error('invalid_supermemo_element_tree');
    seen.add(id);
  }
  const collection = collectionDirectory ? await readSuperMemoCollection(collectionDirectory, elements) : null;
  return runWithDatabaseConnectionOwner(async () => {
    const now = new Date();
    const offset = sourceOffset(now);
    const rows = describeSuperMemoSource(elements, offset, loadReviewSchedulerSettings());
    const preview: NativeSuperMemoPreview = {
      referenceDay: calendarDateKey(now), pairedCollection: collection !== null, rows: rows.map(row => {
        const paired = collection?.get(row.id);
        return paired ? { ...row, sourceDue: paired.due, sourceRank: paired.rank, sourceChildren: paired.children } : row;
      })
    };
    return write ? runSuperMemoImport({ elements, preview, percent, offset, collectionDirectory }) : preview;
  });
}
