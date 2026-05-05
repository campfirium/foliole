import fs from 'node:fs/promises';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { applyImportedHighlightAnchors } from '../../lib/core/database/importHighlightAnchors.js';
import { replaceImportedHighlightNodes } from '../../lib/core/database/importPipelineHighlightNodes.js';
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

interface ImportedBookSection {
  [column: string]: unknown;
  content: string;
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

function readNextNodePosition(driver: DatabaseDriver) {
  const row = driver.queryOne<{ position: number | null }>('SELECT MAX(position) AS position FROM node_order');
  return (row?.position ?? -1) + 1;
}

function readImportedBookSections(rootNodeId: string) {
  const connection = openDatabaseConnection();
  return connection.driver.queryAll<ImportedBookSection>(
    `WITH RECURSIVE book_sections(id, parent_id, title, content, anchor_link, sort_path) AS (
       SELECT n.id, n.parent_id, n.title, n.content, n.anchor_link, '' AS sort_path
       FROM nodes n
       WHERE n.id = ? AND n.deleted_at IS NULL
       UNION ALL
       SELECT child.id,
              child.parent_id,
              child.title,
              child.content,
              child.anchor_link,
              book_sections.sort_path || '.' || printf('%020d', COALESCE(o.position, 0))
       FROM nodes child
       LEFT JOIN node_order o ON o.node_id = child.id
       JOIN book_sections ON child.parent_id = book_sections.id
       WHERE child.deleted_at IS NULL
     )
     SELECT id, title, content
     FROM book_sections
     WHERE id <> ? AND anchor_link IS NULL
     ORDER BY sort_path, id`,
    [rootNodeId, rootNodeId]
  );
}

function buildSectionHighlightLocators(sections: ImportedBookSection[]) {
  return sections.map((section, sectionIndex) => ({
    locator: createContextExcerptLocator(section.content),
    section,
    sectionIndex
  }));
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
    let nextPosition = readNextNodePosition(driver);
    input.sections.forEach((section) => {
      const sectionHighlights = input.groupedBySection.get(section.id) ?? [];
      const anchored = applyImportedHighlightAnchors({ content: section.content, highlights: sectionHighlights });
      const insertedCount = replaceImportedHighlightNodes({
        driver,
        highlights: anchored.highlights,
        importedAt: input.importedAt,
        parentNodeId: section.id,
        parentContent: anchored.content,
        startPosition: nextPosition
      });
      nextPosition += insertedCount;
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

  const sections = readImportedBookSections(input.rootNodeId);
  if (sections.length === 0) {
    return { matchedCount: 0, unmatchedCount: extractReadwiseSidecarHighlights(markdown, input.readwiseConfig).length };
  }

  const grouped = groupLocatedHighlights(sections, markdown, input.readwiseConfig);
  persistSectionHighlights({
    groupedBySection: grouped.groupedBySection,
    importedAt: input.importedAt,
    sections
  });
  return { matchedCount: grouped.matchedCount, unmatchedCount: grouped.unmatchedCount };
}
