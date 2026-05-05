import fs from 'node:fs/promises';

import { applyImportedHighlightAnchors } from '../../lib/core/database/importHighlightAnchors.js';
import { replaceImportedHighlightNodes } from '../../lib/core/database/importPipelineHighlightNodes.js';
import type { PreparedImportHighlightRecord } from '../../lib/core/import/contract.js';
import { findContextExcerpt } from '../../lib/core/import/controlledContextMatch.js';
import { extractReadwiseSidecarHighlights } from '../../lib/core/import/readwiseReaderParsing.js';
import type { ReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { openDatabaseConnection } from '../database/connection.js';

interface ImportedBookSection {
  [column: string]: unknown;
  content: string;
  id: string;
}

interface LocatedReadwiseBookHighlight extends PreparedImportHighlightRecord {
  sectionId: string;
  sectionIndex: number;
}

function stripImportedHighlightAnchors(content: string) {
  return content.replace(/<\/?highlight id="[1-9]\d*">/g, '');
}

function readNextNodePosition() {
  const connection = openDatabaseConnection();
  const row = connection.driver.queryOne<{ position: number | null }>('SELECT MAX(position) AS position FROM node_order');
  return (row?.position ?? -1) + 1;
}

function readImportedBookSections(rootNodeId: string) {
  const connection = openDatabaseConnection();
  return connection.driver.queryAll<ImportedBookSection>(
    `WITH RECURSIVE book_sections(id, parent_id, content, anchor_link, sort_path) AS (
       SELECT n.id, n.parent_id, n.content, n.anchor_link, '' AS sort_path
       FROM nodes n
       WHERE n.id = ? AND n.deleted_at IS NULL
       UNION ALL
       SELECT child.id,
              child.parent_id,
              child.content,
              child.anchor_link,
              book_sections.sort_path || '.' || printf('%020d', COALESCE(o.position, 0))
       FROM nodes child
       LEFT JOIN node_order o ON o.node_id = child.id
       JOIN book_sections ON child.parent_id = book_sections.id
       WHERE child.deleted_at IS NULL
     )
     SELECT id, content
     FROM book_sections
     WHERE id <> ? AND anchor_link IS NULL
     ORDER BY sort_path, id`,
    [rootNodeId, rootNodeId]
  );
}

function collectSectionMatches(sections: ImportedBookSection[], quote: string) {
  return sections
    .map((section, index) => ({
      content: findContextExcerpt(stripImportedHighlightAnchors(section.content), quote),
      sectionId: section.id,
      sectionIndex: index
    }))
    .filter((match): match is LocatedReadwiseBookHighlight => Boolean(match.content));
}

function locateReadwiseBookHighlight(
  sections: ImportedBookSection[],
  quote: string,
  preferredStartIndex: number,
  label?: string
) {
  const matches = collectSectionMatches(sections, quote);
  if (matches.length === 0) {
    return null;
  }

  const forwardMatch = matches.find((match) => match.sectionIndex >= preferredStartIndex);
  if (forwardMatch) {
    return { ...forwardMatch, label: label ?? null } satisfies LocatedReadwiseBookHighlight;
  }

  return matches.length === 1 ? { ...matches[0], label: label ?? null } : null;
}

function groupLocatedHighlights(sections: ImportedBookSection[], markdown: string, readwiseConfig: ReadwiseReaderConfig) {
  const groupedBySection = new Map<string, PreparedImportHighlightRecord[]>();
  let preferredStartIndex = 0;
  let matchedCount = 0;
  let unmatchedCount = 0;

  extractReadwiseSidecarHighlights(markdown, readwiseConfig).forEach((highlight) => {
    const located = locateReadwiseBookHighlight(sections, highlight.text, preferredStartIndex, highlight.label);
    if (!located) {
      unmatchedCount += 1;
      return;
    }
    preferredStartIndex = located.sectionIndex;
    matchedCount += 1;
    const sectionHighlights = groupedBySection.get(located.sectionId) ?? [];
    sectionHighlights.push({ content: located.content, label: located.label ?? null });
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
      const baseContent = stripImportedHighlightAnchors(section.content);
      const anchored = applyImportedHighlightAnchors({ content: baseContent, highlights: sectionHighlights });
      if (anchored.content !== section.content) {
        driver.execute('UPDATE nodes SET content = ?, updated_at = ? WHERE id = ?', [anchored.content, input.importedAt, section.id]);
      }
      replaceImportedHighlightNodes({
        driver,
        highlights: anchored.highlights,
        importedAt: input.importedAt,
        parentNodeId: section.id,
        startPosition: readNextNodePosition()
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
