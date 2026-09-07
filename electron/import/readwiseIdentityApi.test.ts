// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { fetchReadwiseIdentityEvidence } from './readwiseIdentityApi.js';

function json(payload: unknown) {
  return new Response(JSON.stringify(payload), { status: 200 });
}

it('resolves note ancestry and cross-checks the Reader document through Export', async () => {
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/v2/export/') {
      return json({ nextPageCursor: null, results: [{ external_id: 'document-1', source: 'reader', highlights: [] }] });
    }
    const id = url.searchParams.get('id');
    return json({ results: [{
      category: id === 'note-1' ? 'note' : id === 'highlight-1' ? 'highlight' : 'article',
      id,
      parent_id: id === 'note-1' ? 'highlight-1' : id === 'highlight-1' ? 'document-1' : null
    }] });
  }) as typeof fetch;

  const result = await fetchReadwiseIdentityEvidence({
    fetchImpl, ids: ['note-1', 'highlight-1'], minIntervalMs: 0, token: 'secret'
  });

  expect([...result.documents.keys()]).toEqual(['note-1', 'highlight-1', 'document-1']);
  expect([...result.exportIds]).toEqual(['document-1']);
  expect(fetchImpl).toHaveBeenCalledTimes(4);
  for (const call of vi.mocked(fetchImpl).mock.calls) {
    expect(call[1]).toMatchObject({ headers: { Authorization: 'Token secret' }, redirect: 'error' });
  }
});

it('does not infer missing or cyclic identity', async () => {
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/v2/export/') return json({ results: [] });
    const id = url.searchParams.get('id');
    return json({ results: id === 'missing' ? [] : [{ category: 'note', id, parent_id: id }] });
  }) as typeof fetch;

  const result = await fetchReadwiseIdentityEvidence({
    fetchImpl, ids: ['missing', 'cycle'], minIntervalMs: 0, token: 'secret'
  });
  expect(result.documents.has('missing')).toBe(false);
  expect(result.documents.get('cycle')).toMatchObject({ id: 'cycle', parentId: 'cycle' });
  expect(result.exportIds.size).toBe(0);
});
