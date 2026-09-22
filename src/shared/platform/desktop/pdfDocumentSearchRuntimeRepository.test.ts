import { beforeEach, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../runtimeInvoke';

import { searchRuntimePdfDocument } from './pdfDocumentSearchRuntimeRepository';

vi.mock('../runtimeInvoke', () => ({ getRuntimeInvoke: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

it('invokes and normalizes current PDF document search results', async () => {
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn().mockResolvedValue({
    matches: [{ fragments: [{ end: 4, page: 2, start: 1 }], id: '2:1:0', match_start: 1, page: 2 }],
    status: 'ready'
  }));

  await expect(searchRuntimePdfDocument('topic-1', 'keyword')).resolves.toEqual({
    matches: [{ fragments: [{ end: 4, page: 2, start: 1 }], id: '2:1:0', matchStart: 1, page: 2 }],
    status: 'ready'
  });
});
