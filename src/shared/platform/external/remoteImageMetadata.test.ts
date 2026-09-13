import { beforeEach, expect, it, vi } from 'vitest';

const invoke = vi.fn();

vi.mock('../runtimeInvoke', () => ({ getRuntimeInvoke: () => invoke }));

import { loadRemoteImageMetadata } from './remoteImageMetadata';

beforeEach(() => invoke.mockReset());

it('loads validated remote image dimensions through the native contract', async () => {
  invoke.mockResolvedValue({ intrinsic_size: { height: 240, width: 320 } });

  await expect(loadRemoteImageMetadata('https://example.com/image.png', 'node-1', true))
    .resolves.toEqual({ height: 240, width: 320 });
  expect(invoke).toHaveBeenCalledWith('load_remote_image_metadata', {
    bypass_failure_cache: true,
    node_id: 'node-1',
    source_url: 'https://example.com/image.png'
  });
});

it('rejects malformed dimension payloads', async () => {
  invoke.mockResolvedValue({ intrinsic_size: { height: 0, width: 320 } });
  await expect(loadRemoteImageMetadata('https://example.com/image.png', null)).resolves.toBeNull();
});
