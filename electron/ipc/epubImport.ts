import { createHash } from 'node:crypto';

import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import type { PersistedImportRecord } from '../../lib/core/import/contract.js';
import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import { openDatabaseConnection } from '../database/connection.js';
import { runPreparedImport } from '../database/importPipeline.js';

import { type RawChapter, readRawEpubBook } from './epubImportBook.js';
import { type ImportSourceDescriptor } from './importSourcePipeline.js';

interface PreparedChapter {
  content: string;
  degradedReason: string | null;
  hideTitleHeading: boolean;
  key: string;
  title: string;
}

function appendReason(current: string | null, next: string | null) {
  if (!next) return current;
  if (!current) return next;
  return current.includes(next) ? current : `${current}; ${next}`;
}

function createChapterNodeId(sourceFingerprint: string, chapterKey: string) {
  return `node-epub-${createHash('sha256').update(`${sourceFingerprint}\u001f${chapterKey}`).digest('hex').slice(0, 24)}`;
}

function prepareChapter(chapter: RawChapter, index: number, importedAt: string) {
  const prepared = createPreparedDesktopTextImport({
    content: chapter.content,
    degradedReason: chapter.degradedReason,
    fileName: `chapter-${index + 1}.xhtml`,
    filePath: `epub-chapter#${chapter.key}`,
    importedAt,
    kind: 'epub',
    sourceProfile: 'epub',
    titleStrategy: 'heading'
  });
  return {
    content: prepared.content,
    degradedReason: prepared.degradedReason,
    hideTitleHeading: prepared.hideTitleHeading,
    key: chapter.key,
    title: prepared.nodeTitle
  } satisfies PreparedChapter;
}

function syncChapterNodes(parentNodeId: string, sourceFingerprint: string, importedAt: string, chapters: PreparedChapter[]) {
  const connection = openDatabaseConnection();
  const firstPosition = (connection.driver.queryOne<{ position: number | null }>('SELECT MAX(position) AS position FROM node_order')?.position ?? -1) + 1;

  connection.driver.transaction((driver) => {
    chapters.forEach((chapter, index) => {
      upsertNodeSnapshot(driver, {
        anchorLink: null,
        content: chapter.content,
        createdAt: importedAt,
        hideTitleHeading: chapter.hideTitleHeading,
        isTitleManual: true,
        kind: 'topic',
        nodeId: createChapterNodeId(sourceFingerprint, chapter.key),
        parentNodeId,
        position: firstPosition + index,
        reveal: null,
        title: chapter.title,
        updatedAt: importedAt
      });
    });
  });
}

function applyAggregateDegrade(record: PersistedImportRecord, degradedReason: string | null) {
  if (!degradedReason || !record.nodeId) return record;
  const connection = openDatabaseConnection();
  connection.driver.execute('UPDATE import_runs SET result_status = ?, degraded_reason = ? WHERE id = ?', [
    'degraded',
    degradedReason,
    record.importId
  ]);
  return { ...record, degradedReason, resultStatus: 'degraded' as const };
}

export async function loadEpubPreview(source: ImportSourceDescriptor) {
  const book = await readRawEpubBook(source);
  const importedAt = new Date().toISOString();
  const chapters = book.chapters.map((chapter, index) => prepareChapter(chapter, index, importedAt));
  return ['# ' + book.title, ...chapters.flatMap((chapter) => ['', chapter.content])].join('\n').trim();
}

export async function runEpubImport(source: ImportSourceDescriptor, importedAt: string) {
  const book = await readRawEpubBook(source);
  const chapters = book.chapters.map((chapter, index) => prepareChapter(chapter, index, importedAt));
  const summary = createPreparedDesktopTextImport({
    content: ['# ' + book.title, '', ...chapters.map((chapter) => `- ${chapter.title}`)].join('\n'),
    fileName: source.sourceName,
    filePath: source.filePath,
    importedAt,
    kind: 'epub',
    sourceProfile: 'epub',
    titleStrategy: 'heading'
  });
  const imported = runPreparedImport(summary);
  if (!imported.nodeId) {
    throw new Error('EPUB import failed: parent node was not created');
  }

  syncChapterNodes(imported.nodeId, imported.sourceFingerprint, importedAt, chapters);
  const aggregateReason = chapters.reduce<string | null>((reason, chapter) => appendReason(reason, chapter.degradedReason), imported.degradedReason);
  return applyAggregateDegrade(imported, aggregateReason);
}
