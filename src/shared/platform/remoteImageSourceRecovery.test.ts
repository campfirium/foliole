import { beforeEach, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());

vi.mock('./runtimeInvoke', () => ({ getRuntimeInvoke: () => invoke }));

import { loadRemoteImageSourceContext } from './remoteImageSourceRecovery';

beforeEach(() => vi.clearAllMocks());

it('uses the narrow source-context command and normalizes untrusted payload fields', async () => {
  invoke.mockResolvedValue({
    image_host: 'cdn.example',
    learned_source_origin: 'https://learned.example/',
    local_path: '/Users/private/source.md',
    source: 'node',
    source_origin: 'https://source.example/'
  });

  await expect(loadRemoteImageSourceContext('https://cdn.example/image.png', 'node-1')).resolves.toEqual({
    imageHost: 'cdn.example',
    learnedSourceOrigin: 'https://learned.example/',
    source: 'node',
    sourceOrigin: 'https://source.example/'
  });
  expect(invoke).toHaveBeenCalledWith('load_remote_image_source_context', {
    node_id: 'node-1', source_url: 'https://cdn.example/image.png'
  });
});
