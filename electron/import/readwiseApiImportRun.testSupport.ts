import { createDefaultImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';

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
    readwiseReaderConfig: { ...settings.readwiseReaderConfig, withoutHighlightsDestination },
    readwiseSourceMode: 'api' as const
  };
}
