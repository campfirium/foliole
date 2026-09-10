import { createDefaultImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import { openDatabaseConnection } from '../database/connection.js';

export function response(results: unknown[], nextPageCursor: string | null = null) {
  return new Response(JSON.stringify({ nextPageCursor, results }), { status: 200 });
}

export function documents(start: number, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    category: 'article', html_content: `<p>Body ${start + index}</p>`,
    id: `document-${String(start + index).padStart(3, '0')}`, title: `Title ${start + index}`,
    updated_at: '2026-09-07T00:00:00.000Z'
  }));
}

export function apiSettings(withoutHighlightsDestination: 'inbox' | 'off' = 'inbox') {
  const settings = createDefaultImportManagerSettings();
  return {
    ...settings,
    readwiseAutoImportPolicy: {
      ...settings.readwiseAutoImportPolicy,
      articleWithoutHighlights: withoutHighlightsDestination,
      emailWithoutHighlights: withoutHighlightsDestination,
      epubWithoutHighlights: withoutHighlightsDestination,
      pdfWithoutHighlights: withoutHighlightsDestination,
      rssWithoutHighlights: withoutHighlightsDestination,
      tweetWithoutHighlights: withoutHighlightsDestination,
      videoWithoutHighlights: withoutHighlightsDestination
    },
    readwiseSourceMode: 'api' as const
  };
}

export function exportBook(documentId: string, highlightId: string, category: string) {
  return {
    category,
    external_id: documentId,
    highlights: [{ external_id: highlightId, text: `Body ${documentId}` }],
    source: 'reader'
  };
}

export function readerDocument(id: string, category: string, withBody = true) {
  return {
    category,
    html_content: withBody ? `<p>Body ${id}</p>` : undefined,
    id,
    title: `Title ${id}`,
    updated_at: '2026-09-07T00:00:00.000Z'
  };
}

export function importedReadwiseApiCount() {
  return openDatabaseConnection().driver.queryOne<{ count: number }>(
    "SELECT COUNT(*) count FROM import_sources WHERE remote_provider = 'readwise'"
  )?.count ?? 0;
}
