// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  driver: { queryAll: vi.fn(), queryOne: vi.fn() },
  loadRemoteImageLearnedSource: vi.fn()
}));

vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => ({ driver: mocks.driver })
}));

vi.mock('./remoteImageLearnedSources.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./remoteImageLearnedSources.js')>();
  return { ...original, loadRemoteImageLearnedSource: mocks.loadRemoteImageLearnedSource };
});

import {
  resolveRemoteImageSourceContext,
  resolveRemoteImageSourceOriginWithDriver
} from './remoteImageSourceContext.js';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.driver.queryAll.mockReturnValue([]);
  mocks.loadRemoteImageLearnedSource.mockReturnValue({ imageHost: 'cdn.example', sourceOrigin: null });
});

function sqlTrace() {
  return [
    ...mocks.driver.queryOne.mock.calls.map(([sql, params]) => ({ params, sql: String(sql) })),
    ...mocks.driver.queryAll.mock.calls.map(([sql, params]) => ({ params, sql: String(sql) }))
  ];
}

it('stops at the import source locator and selects only the minimum columns', () => {
  mocks.driver.queryOne
    .mockReturnValueOnce({ anchor_link: null, id: 'node-1', parent_id: null })
    .mockReturnValueOnce({ source_locator: 'https://source.example/article?id=1#section' });

  expect(resolveRemoteImageSourceOriginWithDriver(mocks.driver as never, 'node-1'))
    .toBe('https://source.example/');
  expect(mocks.driver.queryAll).not.toHaveBeenCalled();
  expect(sqlTrace().map(({ sql }) => sql)).toEqual([
    expect.stringContaining('SELECT id, parent_id, anchor_link FROM nodes'),
    expect.stringContaining('SELECT source_locator FROM import_sources')
  ]);
});

it('falls back through import runs before reading frontmatter', () => {
  mocks.driver.queryOne
    .mockReturnValueOnce({ anchor_link: null, id: 'node-1', parent_id: null })
    .mockReturnValueOnce({ source_locator: '/Users/me/article.md' });
  mocks.driver.queryAll.mockReturnValue([
    { source_locator: 'file:///Users/me/article.md' },
    { source_locator: 'https://archive.example/path' }
  ]);

  expect(resolveRemoteImageSourceOriginWithDriver(mocks.driver as never, 'node-1'))
    .toBe('https://archive.example/');
  expect(mocks.driver.queryOne).toHaveBeenCalledTimes(2);
  expect(mocks.driver.queryAll).toHaveBeenCalledWith(
    expect.stringContaining('SELECT source_locator FROM import_runs'), ['node-1']
  );
});

it('reads only the derived child parent body when locators have no HTTP origin', () => {
  mocks.driver.queryOne
    .mockReturnValueOnce({ anchor_link: '{"kind":"highlight"}', id: 'child-1', parent_id: 'parent-1' })
    .mockReturnValueOnce({ source_locator: '/imports/article.md' })
    .mockReturnValueOnce({
      body_blob_data: null,
      body_blob_hash: null,
      content: '---\nurl: https://frontmatter.example/article?id=1\n---\n# Parent'
    });
  mocks.driver.queryAll.mockReturnValue([{ source_locator: 'D:\\Articles\\saved.md' }]);

  expect(resolveRemoteImageSourceOriginWithDriver(mocks.driver as never, 'child-1'))
    .toBe('https://frontmatter.example/');
  const trace = sqlTrace();
  expect(trace.slice(1).every(({ params }) => params?.[0] === 'parent-1')).toBe(true);
  expect(trace.map(({ sql }) => sql).join('\n')).not.toMatch(/keep_import|attachment|pdf_page/i);
});

it('uses learned provenance only when the node has no origin', () => {
  mocks.driver.queryOne
    .mockReturnValueOnce({ anchor_link: null, id: 'node-1', parent_id: null })
    .mockReturnValueOnce(undefined)
    .mockReturnValueOnce({ body_blob_data: null, body_blob_hash: null, content: '' });
  mocks.loadRemoteImageLearnedSource.mockReturnValue({
    imageHost: 'cdn.example', sourceOrigin: 'https://learned.example/'
  });

  expect(resolveRemoteImageSourceContext('node-1', 'https://cdn.example/image.png')).toEqual({
    imageHost: 'cdn.example',
    learnedSourceOrigin: 'https://learned.example/',
    source: 'learned',
    sourceOrigin: 'https://learned.example/'
  });
});

it('does not query node tables without a node id', () => {
  expect(resolveRemoteImageSourceContext(null, 'https://cdn.example/image.png')).toMatchObject({
    source: 'none', sourceOrigin: null
  });
  expect(mocks.driver.queryOne).not.toHaveBeenCalled();
  expect(mocks.driver.queryAll).not.toHaveBeenCalled();
});
