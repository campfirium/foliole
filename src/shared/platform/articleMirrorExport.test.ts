import { beforeEach, expect, it, vi } from 'vitest';

import { exportCurrentArticleMirror } from './articleMirrorExport';
import { getRuntimeInvoke } from './runtimeInvoke';

vi.mock('./runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

beforeEach(() => {
  vi.mocked(getRuntimeInvoke).mockReset();
});

it('exports the current article mirror through the native bridge', async () => {
  const invoke = vi.fn().mockResolvedValue({ status: 'saved', path: '/tmp/article.md' });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  await expect(exportCurrentArticleMirror('node-1')).resolves.toEqual({ status: 'saved', path: '/tmp/article.md' });
  expect(invoke).toHaveBeenCalledWith('export_current_article_mirror', { node_id: 'node-1' });
});
