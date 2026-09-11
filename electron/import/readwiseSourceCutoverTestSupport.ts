import { promises as fs } from 'node:fs';
import path from 'node:path';

import { vi } from 'vitest';

import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { openDatabaseConnection } from '../database/connection.js';

import { readwiseKeepAdapter } from './readwiseKeepAdapter.js';
import { resolveReadwiseTopicMergeSource } from './readwiseTopicMergeSource.js';

export async function seedMigratableSource(sourcePath: string) {
  await fs.writeFile(path.join(sourcePath, 'Sample.md'), [
    '# Sample', '## Full Document', 'Legacy body with remembered phrase.',
    'https://read.readwise.io/read/document-1', '## Highlights',
    'remembered phrase [...] (https://read.readwise.io/read/highlight-1)'
  ].join('\n'));
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO nodes (id,parent_id,kind,title,is_title_manual,content,anchor_link,created_at,updated_at)
    VALUES ('topic-1',NULL,'topic','Sample',0,'placeholder',NULL,'old','old'),
      ('local-cloze','topic-1','cloze','Local',1,'Local answer',
       '{"id":"local","kind":"cloze","locator":{"from":17,"to":34,"originalText":"remembered phrase"}}','old','old')`);
  driver.execute(`INSERT INTO desktop_sources (source_ref,source_type,config_ref,host_name,host_platform,
    root_path,path_flavor,type_settings_json,created_at,updated_at) VALUES
    ('readwise:local','readwise','articles-local','This Mac',?,?,?,?, 'old','old')`,
  [process.platform, sourcePath, process.platform === 'win32' ? 'windows' : 'posix',
    JSON.stringify({ highlightPath: sourcePath, keepState: 'enabled', kind: 'articles' })]);
  driver.execute(`INSERT INTO import_sources (source_fingerprint,provider,source_kind,source_name,source_locator,
    first_imported_at,last_imported_at,last_content_fingerprint,latest_node_id,source_ref,source_location) VALUES
    ('source-1','desktop_text_file','markdown','Sample.md',?,'old','old','hash','topic-1','readwise:local','Sample.md')`,
  [path.join(sourcePath, 'Sample.md')]);
  const merge = await resolveReadwiseTopicMergeSource('topic-1');
  if (!merge) throw new Error('missing merge source');
  const prepared = await readwiseKeepAdapter.loadPreparedRecord(merge.descriptor, {
    highlightDirectoryPath: merge.readwiseSource.highlightPath,
    highlightPolicy: 'reference_only',
    importedAt: 'old',
    kind: merge.readwiseSource.kind,
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });
  driver.execute("UPDATE nodes SET content=? WHERE id='topic-1'", [prepared.content]);
}

export function migrationFetch() {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/v2/export/') {
      return Response.json({ nextPageCursor: null, results: [{
        external_id: 'document-1',
        highlights: [{ external_id: 'highlight-1', text: 'remembered phrase' }],
        source: 'reader'
      }] });
    }
    if (url.searchParams.get('category') === 'highlight') {
      return Response.json({ nextPageCursor: null, results: [
        { category: 'highlight', id: 'highlight-1', parent_id: 'document-1' }
      ] });
    }
    if (url.searchParams.has('category')) {
      return Response.json({ nextPageCursor: null, results: [] });
    }
    const id = url.searchParams.get('id');
    if (id) {
      return Response.json({ results: [{
        category: 'article',
        created_at: '2026-09-10T00:00:00.000Z',
        html_content: '<p>API body with remembered phrase.</p>',
        id,
        parent_id: null,
        title: 'Sample'
      }] });
    }
    return Response.json({ nextPageCursor: null, results: [] });
  });
}
