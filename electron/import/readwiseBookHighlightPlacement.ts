import fs from 'node:fs/promises';

import { applyImportedHighlightAnchors } from '../../lib/core/database/importHighlightAnchors.js';
import { replaceImportedHighlightNodes } from '../../lib/core/database/importPipelineHighlightNodes.js';
import { requireResolvedNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import type { PreparedImportHighlightRecord } from '../../lib/core/import/contract.js';
import { createContextExcerptLocator } from '../../lib/core/import/controlledContextMatch.js';
import {
  findPreparedHighlightExcerptInLocator,
  prepareHighlightExcerptCandidate,
  type PreparedHighlightExcerptCandidate
} from '../../lib/core/import/highlightExcerptMatch.js';
import { extractReadwiseSidecarHighlights } from '../../lib/core/import/readwiseReaderParsing.js';
import type { ReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { openDatabaseConnection } from '../database/connection.js';

interface ImportedBookSection extends NodeBodyRow {
  id: string;
  title: string;
}

interface LocatedReadwiseBookHighlight extends PreparedImportHighlightRecord {
  sectionId: string;
  sectionIndex: number;
}

interface SectionHighlightLocator {
  locator: ReturnType<typeof createContextExcerptLocator>;
  section: ImportedBookSection;
  sectionIndex: number;
}

function readImportedBookSections(rootNodeId: string) {
  const connection = openDatabaseConnection();
  return connection.driver.queryAll<ImportedBookSection>(
    `WITH RECURSIVE book_sections(id, parent_id, title, content, body_blob_hash, anchor_link, sort_path) AS (
       SELECT n.id, n.parent_id, n.title, n.content, n.body_blob_hash, n.anchor_link,
              n.created_at || ':' || n.id AS sort_path
       FROM nodes n
       WHERE n.id = ? AND n.deleted_at IS NULL
       UNION ALL
       SELECT child.id,
              child.parent_id,
              child.title,
              child.content,
              child.body_blob_hash,
              child.anchor_link,
              book_sections.sort_path || '.' || child.created_at || ':' || child.id
       FROM nodes child
       JOIN book_sections ON child.parent_id = book_sections.id
       WHERE child.deleted_at IS NULL
     )
     SELECT book_sections.id, book_sections.title, book_sections.content,
            book_sections.body_blob_hash, cbd.data AS body_blob_data
     FROM book_sections
     LEFT JOIN content_blob_data cbd ON cbd.hash = book_sections.body_blob_hash
     WHERE id <> ? AND anchor_link IS NULL
     ORDER BY sort_path, id`,
    [rootNodeId, rootNodeId]
  ).map((row) => ({ ...row, content: requireResolvedNodeBody(row, row.id).content }));
}

function buildSectionHighlightLocators(sections: ImportedBookSection[]) {
  return sections.map((section, sectionIndex) => ({
    locator: createContextExcerptLocator(section.content),
    section,
    sectionIndex
  }));
}

function normalizeBookHighlightText(value: string) {
  return value.replace(/\r\n?/g, '\n').trim();
}

function filterBookSections(sections: ImportedBookSection[], highlightTexts: Set<string>) {
  return sections.filter((section) => !highlightTexts.has(normalizeBookHighlightText(section.content)));
}

function buildSearchOrder(total: number, preferredStartIndex: number) {
  if (total === 0) {
    return [];
  }
  const safeStartIndex = Math.max(0, Math.min(preferredStartIndex, total - 1));
  const ordered = new Set<number>();
  ordered.add(safeStartIndex);

  // Favor nearby chapters first, then keep moving forward, and finally backfill.
  for (let radius = 1; radius <= 3; radius += 1) {
    const forward = safeStartIndex + radius;
    const backward = safeStartIndex - radius;
    if (forward < total) {
      ordered.add(forward);
    }
    if (backward >= 0) {
      ordered.add(backward);
    }
  }
  for (let index = safeStartIndex + 1; index < total; index += 1) {
    ordered.add(index);
  }
  for (let index = 0; index < safeStartIndex; index += 1) {
    ordered.add(index);
  }

  return Array.from(ordered.values());
}

function locateReadwiseBookHighlight(
  sections: SectionHighlightLocator[],
  highlight: PreparedHighlightExcerptCandidate,
  preferredStartIndex: number
) {
  for (const index of buildSearchOrder(sections.length, preferredStartIndex)) {
    const section = sections[index];
    if (!section) {
      continue;
    }
    const content = findPreparedHighlightExcerptInLocator(section.locator, highlight);
    if (!content) {
      continue;
    }
    return {
      content,
      label: highlight.label,
      sectionId: section.section.id,
      sectionIndex: section.sectionIndex
    } satisfies LocatedReadwiseBookHighlight;
  }
  return null;
}

function groupLocatedHighlights(sections: ImportedBookSection[], markdown: string, readwiseConfig: ReadwiseReaderConfig) {
  const groupedBySection = new Map<string, PreparedImportHighlightRecord[]>();
  const sectionLocators = buildSectionHighlightLocators(sections);
  let preferredStartIndex = 0;
  let matchedCount = 0;
  let unmatchedCount = 0;

  extractReadwiseSidecarHighlights(markdown, readwiseConfig).forEach((highlight) => {
    const prepared = prepareHighlightExcerptCandidate(highlight);
    const located = locateReadwiseBookHighlight(sectionLocators, prepared, preferredStartIndex);
    if (!located) {
      unmatchedCount += 1;
      return;
    }
    preferredStartIndex = located.sectionIndex;
    matchedCount += 1;
    const sectionHighlights = groupedBySection.get(located.sectionId) ?? [];
    sectionHighlights.push({
      content: highlight.text.trim(),
      label: located.label ?? null,
      locatorText: located.content
    });
    groupedBySection.set(located.sectionId, sectionHighlights);
  });

  return { groupedBySection, matchedCount, unmatchedCount };
}

function persistSectionHighlights(input: {
  groupedBySection: Map<string, PreparedImportHighlightRecord[]>;
  importedAt: string;
  sections: ImportedBookSection[];
}) {
  const connection = openDatabaseConnection();
  connection.driver.transaction((driver) => {
    input.sections.forEach((section) => {
      const sectionHighlights = input.groupedBySection.get(section.id) ?? [];
      const anchored = applyImportedHighlightAnchors({ content: section.content, highlights: sectionHighlights });
      replaceImportedHighlightNodes({
        driver,
        highlights: anchored.highlights,
        importedAt: input.importedAt,
        parentNodeId: section.id,
        parentContent: anchored.content
      });
    });
  });
}

export async function placeReadwiseBookHighlights(input: {
  highlightMarkdownPath: string | null;
  importedAt: string;
  readwiseConfig: ReadwiseReaderConfig;
  rootNodeId: string | null;
}) {
  if (!input.rootNodeId || !input.highlightMarkdownPath) {
    return { matchedCount: 0, unmatchedCount: 0 };
  }

  let markdown = '';
  try {
    markdown = await fs.readFile(input.highlightMarkdownPath, 'utf8');
  } catch {
    return { matchedCount: 0, unmatchedCount: 0 };
  }

  const highlights = extractReadwiseSidecarHighlights(markdown, input.readwiseConfig);
  const highlightTexts = new Set(highlights.map((highlight) => normalizeBookHighlightText(highlight.text)).filter(Boolean));
  const sections = filterBookSections(readImportedBookSections(input.rootNodeId), highlightTexts);
  if (sections.length === 0) {
    return { matchedCount: 0, unmatchedCount: highlights.length };
  }

  const grouped = groupLocatedHighlights(sections, markdown, input.readwiseConfig);
  persistSectionHighlights({
    groupedBySection: grouped.groupedBySection,
    importedAt: input.importedAt,
    sections
  });
  return { matchedCount: grouped.matchedCount, unmatchedCount: grouped.unmatchedCount };
}
